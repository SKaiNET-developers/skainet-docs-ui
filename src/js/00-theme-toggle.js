/*
 * SKaiNET theme-toggle click handler.
 *
 * The actual theme bootstrap (read storage / prefers-color-scheme,
 * set `data-theme` on <html>) runs inline in <head> via the
 * `partials/head-prelude.hbs` override — it has to happen before
 * the first paint to avoid a flash of the wrong theme.
 *
 * This file is the companion: it wires up the click behavior on
 * the `#theme-toggle` button in the navbar. The button itself is
 * declared in `partials/header-content.hbs`.
 *
 * Numbered `00-` so it loads first in the bundled `js/site.js`.
 */
/* global document, localStorage */
;(function () {
  'use strict'

  var STORAGE_KEY = 'skainet-theme'
  var root = document.documentElement

  function ready (fn) {
    if (document.readyState !== 'loading') return fn()
    document.addEventListener('DOMContentLoaded', fn)
  }

  function setTheme (theme) {
    root.setAttribute('data-theme', theme)
    try { localStorage.setItem(STORAGE_KEY, theme) } catch (e) { /* noop */ }
  }

  ready(function () {
    var btn = document.getElementById('theme-toggle')
    if (!btn) return
    btn.addEventListener('click', function () {
      var next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'
      setTheme(next)
    })
  })
})()
