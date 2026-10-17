// @ts-nocheck
// The mini-jog's DOM helpers, as handed over.
/**
 * A ~40-line stand-in for a UI library. Enough ergonomics to build dense panels without
 * hand-writing createElement chains, and nothing to install.
 */

function appendChildren(parent, children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false || child === true) continue;
    parent.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

/**
 * h('td', { class: 'num' }, 42)
 * h('button', { class: 'btn', onclick: fn, disabled: true }, 'Run')
 */
export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props ?? {})) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key === 'style' && typeof value === 'object') Object.assign(el.style, value);
    else if (key.startsWith('on') && typeof value === 'function') {
      el.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key.includes('-')) el.setAttribute(key, value);
    else if (key in el) el[key] = value;
    else el.setAttribute(key, value);
  }
  appendChildren(el, children);
  return el;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Same idea for SVG, which needs a namespace and only takes attributes. */
export function s(tag, props, ...children) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(props ?? {})) {
    if (value === null || value === undefined || value === false) continue;
    el.setAttribute(key, String(value));
  }
  appendChildren(el, children);
  return el;
}

/** Replace a container's contents. */
export function mount(container, ...children) {
  container.replaceChildren();
  appendChildren(container, children);
  return container;
}
