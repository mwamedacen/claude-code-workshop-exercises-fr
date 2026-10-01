// Échappe un texte avant de l'insérer dans du HTML.
export function h(texte) {
  return String(texte ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

export function $(id) {
  return document.getElementById(id);
}
