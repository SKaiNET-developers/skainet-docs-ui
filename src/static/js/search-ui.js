/**
 * SKaiNET site search — the UI behavior behind #search-input.
 *
 * Served verbatim from static/ as a native ES module (deliberately outside the browserify +
 * uglify pipeline, which predates module syntax). The heavy part — the Kotlin/Wasm engine the
 * @skainet/antora-site-search extension publishes under _search/ — is dynamic-imported on the
 * first focus or pointerenter of the search input, so a visitor who never searches downloads
 * none of it.
 *
 * The rendered result markup keeps antora-lunr-extension's CSS classes
 * (search-result-dropdown-menu / -item / -document-title / -document-hit / -section-title /
 * -highlight / -component-header) and its facet contract
 * (input[data-facet-filter="component:name"] inside #search-field), so themes and overrides
 * written for the lunr UI port unchanged.
 */

const script = document.getElementById('search-ui-script') || document.currentScript
const config = (script && script.dataset) || {}
const input = document.getElementById('search-input')
const field = document.getElementById('search-field')

if (input && field) initSearchUi()

function initSearchUi () {
  const siteRootPath = config.siteRootPath || ''
  const snippetLength = Math.max(Number.parseInt(config.snippetLength, 10) || 100, 20)
  const shortcutsEnabled = config.searchShortcuts !== 'false'

  let enginePromise
  let dropdown
  let liveRegion
  let options = []
  let activeIndex = -1
  let debounceTimer
  let searchGeneration = 0

  field.classList.add('search-enabled')
  input.setAttribute('role', 'combobox')
  input.setAttribute('aria-autocomplete', 'list')
  input.setAttribute('aria-expanded', 'false')
  input.setAttribute('aria-haspopup', 'listbox')

  /* ---- engine lifecycle -------------------------------------------------------------- */

  const ensureEngine = () => {
    if (!enginePromise) {
      field.setAttribute('aria-busy', 'true')
      // data-engine-path/data-bundle-path are page-relative, but a bare dynamic import()
      // resolves against THIS module's URL (the UI's js/ dir, not the page) — resolve both
      // against the document explicitly.
      enginePromise = import(new URL(`${config.enginePath}/skainet-search.js`, document.baseURI).href)
        .then(({ skainetSearch }) =>
          skainetSearch.init({ bundleUrl: new URL(config.bundlePath, document.baseURI).href, limit: 25 }))
        .then((handle) => {
          field.removeAttribute('aria-busy')
          return handle
        })
        .catch((error) => {
          field.removeAttribute('aria-busy')
          // The disabled style is reserved for exactly this: the engine failed to initialize.
          input.disabled = true
          input.placeholder = 'Search unavailable'
          console.error('skainet-site-search: engine failed to initialize', error)
          throw error
        })
    }
    return enginePromise
  }

  /* ---- querying ---------------------------------------------------------------------- */

  const facetFilter = () => {
    const checked = field.querySelectorAll('input[data-facet-filter]:checked')
    const categories = []
    for (const box of checked) {
      const [key, value] = (box.dataset.facetFilter || '').split(':')
      if (key === 'component' && value) categories.push(value)
    }
    return categories.length ? { category: categories } : undefined
  }

  const runSearch = () => {
    const query = input.value.trim()
    if (query.length < 2) return close()
    const generation = ++searchGeneration
    ensureEngine()
      .then((handle) => handle.search(query, { filter: facetFilter() }))
      .then((hits) => {
        if (generation === searchGeneration) render(query, hits)
      })
      .catch(() => {})
  }

  /* ---- rendering --------------------------------------------------------------------- */

  const ensureDropdown = () => {
    if (!dropdown) {
      dropdown = document.createElement('div')
      dropdown.id = 'search-results'
      dropdown.classList.add('search-result-dropdown-menu')
      dropdown.setAttribute('role', 'listbox')
      dropdown.setAttribute('aria-label', 'Search results')
      field.appendChild(dropdown)
      input.setAttribute('aria-controls', 'search-results')
      liveRegion = document.createElement('span')
      liveRegion.className = 'search-live-region'
      liveRegion.setAttribute('aria-live', 'polite')
      field.appendChild(liveRegion)
    }
    return dropdown
  }

  const close = () => {
    if (dropdown) dropdown.innerHTML = ''
    input.setAttribute('aria-expanded', 'false')
    input.removeAttribute('aria-activedescendant')
    options = []
    activeIndex = -1
  }

  const render = (query, hits) => {
    const menu = ensureDropdown()
    menu.innerHTML = ''
    options = []
    activeIndex = -1
    input.setAttribute('aria-expanded', 'true')
    liveRegion.textContent = hits.length === 1 ? '1 result' : `${hits.length} results`

    if (!hits.length) {
      const item = document.createElement('div')
      item.classList.add('search-result-item')
      item.textContent = 'No results found.'
      menu.appendChild(item)
      return
    }

    const terms = termsOf(query)
    const groups = groupByPage(hits)
    const componentCount = new Set(hits.map((hit) => hit.component).filter(Boolean)).size
    let lastComponent

    for (const group of groups) {
      if (componentCount > 1 && group.component && group.component !== lastComponent) {
        lastComponent = group.component
        const header = document.createElement('div')
        header.classList.add('search-result-component-header')
        header.textContent = group.component
        menu.appendChild(header)
      }
      for (const [hitIndex, hit] of group.hits.entries()) {
        menu.appendChild(renderHit(hit, hitIndex === 0 ? group.title : null, terms))
      }
    }
  }

  const renderHit = (hit, pageTitle, terms) => {
    const item = document.createElement('div')
    item.classList.add('search-result-item')
    const link = document.createElement('a')
    link.href = siteRootPath + hit.url + (hit.anchor ? `#${hit.anchor}` : '')
    link.setAttribute('role', 'option')
    link.id = `search-result-option-${options.length}`
    options.push(link)

    if (pageTitle !== null) {
      const title = document.createElement('div')
      title.classList.add('search-result-document-title')
      title.textContent = pageTitle
      link.appendChild(title)
    }
    if (hit.heading) {
      const section = document.createElement('div')
      section.classList.add('search-result-section-title')
      section.textContent = (hit.headingPath || [hit.heading]).join(' › ')
      link.appendChild(section)
    }
    link.appendChild(renderSnippet(hit.text, terms))
    item.appendChild(link)
    return item
  }

  /** A window of the hit text around the first matched term, matches highlighted. A hit found
   * only by the vector side may contain no literal term; it gets the leading window, unmarked
   * — the same cosmetic mismatch the lunr UI has with stemmed matches. */
  const renderSnippet = (text, terms) => {
    const snippet = document.createElement('div')
    snippet.classList.add('search-result-document-hit')
    const lower = text.toLowerCase()
    let focus = -1
    for (const term of terms) {
      const at = lower.indexOf(term)
      if (at >= 0 && (focus < 0 || at < focus)) focus = at
    }
    let start = focus < 0 ? 0 : Math.max(0, focus - Math.floor(snippetLength / 2))
    if (start > 0) {
      const space = lower.indexOf(' ', start)
      if (space >= 0 && space < start + 20) start = space + 1
    }
    let end = Math.min(text.length, start + snippetLength)
    if (end < text.length) {
      const space = lower.lastIndexOf(' ', end)
      if (space > start) end = space
    }
    const window = text.slice(start, end)
    const pieces = splitByTerms(window, terms)
    if (start > 0) snippet.appendChild(document.createTextNode('…'))
    for (const piece of pieces) {
      if (piece.match) {
        const mark = document.createElement('span')
        mark.classList.add('search-result-highlight')
        mark.textContent = piece.text
        snippet.appendChild(mark)
      } else {
        snippet.appendChild(document.createTextNode(piece.text))
      }
    }
    if (end < text.length) snippet.appendChild(document.createTextNode('…'))
    return snippet
  }

  const termsOf = (query) =>
    query
      .toLowerCase()
      .split(/\s+/)
      .filter((term) => term.length >= 2)
      .sort((a, b) => b.length - a.length)

  const splitByTerms = (text, terms) => {
    if (!terms.length) return [{ text, match: false }]
    const pattern = new RegExp(terms.map(escapeRegExp).join('|'), 'gi')
    const pieces = []
    let last = 0
    for (const found of text.matchAll(pattern)) {
      if (found.index > last) pieces.push({ text: text.slice(last, found.index), match: false })
      pieces.push({ text: found[0], match: true })
      last = found.index + found[0].length
    }
    if (last < text.length) pieces.push({ text: text.slice(last), match: false })
    return pieces
  }

  const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

  const groupByPage = (hits) => {
    const groups = new Map()
    for (const hit of hits) {
      let group = groups.get(hit.url)
      if (!group) groups.set(hit.url, (group = { title: hit.title, component: hit.component, hits: [] }))
      group.hits.push(hit)
    }
    return [...groups.values()]
  }

  /* ---- keyboard and focus ------------------------------------------------------------ */

  const setActive = (index) => {
    if (options[activeIndex]) options[activeIndex].classList.remove('search-result-highlighted')
    activeIndex = index
    const active = options[activeIndex]
    if (active) {
      active.classList.add('search-result-highlighted')
      input.setAttribute('aria-activedescendant', active.id)
      active.scrollIntoView({ block: 'nearest' })
    } else {
      input.removeAttribute('aria-activedescendant')
    }
  }

  input.addEventListener('focus', ensureEngine, { once: true })
  input.addEventListener('pointerenter', ensureEngine, { once: true })

  input.addEventListener('input', () => {
    clearTimeout(debounceTimer)
    debounceTimer = setTimeout(runSearch, 100)
  })

  input.addEventListener('keydown', (event) => {
    switch (event.key) {
      case 'ArrowDown':
        if (options.length) {
          event.preventDefault()
          setActive(Math.min(activeIndex + 1, options.length - 1))
        }
        break
      case 'ArrowUp':
        if (options.length) {
          event.preventDefault()
          setActive(Math.max(activeIndex - 1, 0))
        }
        break
      case 'Home':
        if (options.length) {
          event.preventDefault()
          setActive(0)
        }
        break
      case 'End':
        if (options.length) {
          event.preventDefault()
          setActive(options.length - 1)
        }
        break
      case 'Enter': {
        const target = options[activeIndex] || options[0]
        if (target) {
          event.preventDefault()
          window.location.href = target.href
        }
        break
      }
      case 'Escape':
        input.value = ''
        close()
        break
      case 'Tab':
        close()
        break
    }
  })

  document.addEventListener('click', (event) => {
    if (!field.contains(event.target)) close()
  })

  for (const box of field.querySelectorAll('input[data-facet-filter]')) {
    box.addEventListener('change', runSearch)
  }

  if (shortcutsEnabled) {
    document.addEventListener('keydown', (event) => {
      if ((event.key !== '/' && event.key !== 's') || event.metaKey || event.ctrlKey || event.altKey) return
      const active = document.activeElement
      if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)) return
      event.preventDefault()
      input.focus()
    })
  }
}
