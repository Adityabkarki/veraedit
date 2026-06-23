import '@testing-library/jest-dom'

// JSDOM does not implement scrollIntoView — mock it globally
if (typeof window !== 'undefined') {
  window.HTMLElement.prototype.scrollIntoView = () => {}
}
