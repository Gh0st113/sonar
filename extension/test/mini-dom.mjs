// Mini-DOM pour les tests, sans dépendance : lit un relevé HTML en arbre d'éléments et répond à
// querySelector / closest pour les sélecteurs simples qu'utilise l'extension (balise, #id, .classe,
// [attr], [attr="v"], [attr^="v"], combinateurs « » et « > », listes « , »). Pas un vrai parseur HTML :
// assez pour les fragments de test/fixtures, rien de plus.
const VIDES = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const ENTITES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
export const decoder = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) =>
  e[0] === '#' ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : (ENTITES[e] ?? m));

class Noeud {
  constructor(tag, attrs, parent) { this.tag = tag; this.attrs = attrs; this.parent = parent; this.children = []; this.texte = ''; }
  getAttribute(n) { return this.attrs[n] ?? null; }
  get classes() { return (this.attrs.class ?? '').split(/\s+/).filter(Boolean); }
  get textContent() { return this.texte + this.children.map((c) => c.textContent).join(''); }
  *descendants() { for (const c of this.children) { yield c; yield* c.descendants(); } }
  querySelectorAll(sel) { return [...this.descendants()].filter((n) => n.matches(sel)); }
  querySelector(sel) { return this.querySelectorAll(sel)[0] ?? null; }
  closest(sel) { for (let n = this; n && n.tag; n = n.parent) if (n.matches(sel)) return n; return null; }
  matches(sel) { return this.tag !== '#text' && sel.split(',').some((s) => correspond(this, decouper(s.trim()))); }
}

// « a > b c » → [{ simple: 'a' }, { comb: '>', simple: 'b' }, { comb: ' ', simple: 'c' }]
function decouper(s) {
  const morceaux = s.match(/(?:[^\s>"[]+|\[[^\]]*\])+|>/g);
  const r = [];
  let comb = ' ';
  for (const m of morceaux) { if (m === '>') { comb = '>'; continue; } r.push({ comb, simple: m }); comb = ' '; }
  return r;
}

function simple(n, s) {
  const tag = s.match(/^[a-z][\w-]*/i)?.[0];
  if (tag && n.tag !== tag.toLowerCase()) return false;
  for (const [, c] of s.matchAll(/\.([\w-]+)/g)) if (!n.classes.includes(c)) return false;
  for (const [, i] of s.matchAll(/#([\w-]+)/g)) if (n.attrs.id !== i) return false;
  for (const [, a, op, v] of s.matchAll(/\[([\w-]+)(?:(\^?=)"([^"]*)")?\]/g)) {
    const val = n.attrs[a];
    if (val === undefined) return false;
    if (op === '=' && val !== v) return false;
    if (op === '^=' && !val.startsWith(v)) return false;
  }
  return true;
}

function correspond(n, parts, i = parts.length - 1) {
  if (!simple(n, parts[i].simple)) return false;
  if (i === 0) return true;
  if (parts[i].comb === '>') return Boolean(n.parent?.tag) && correspond(n.parent, parts, i - 1);
  for (let p = n.parent; p && p.tag; p = p.parent) if (correspond(p, parts, i - 1)) return true;
  return false;
}

export function lireHtml(html) {
  const racine = new Noeud(null, {}, null);
  let cur = racine;
  const re = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][\w-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>|([^<]+)/g;
  for (const m of html.matchAll(re)) {
    if (m[4] !== undefined) { const t = new Noeud('#text', {}, cur); t.texte = decoder(m[4]); cur.children.push(t); continue; }
    if (!m[2]) continue;
    const tag = m[2].toLowerCase();
    if (m[1]) { for (let p = cur; p && p.tag; p = p.parent) if (p.tag === tag) { cur = p.parent; break; } continue; }
    const attrs = {};
    for (const a of m[3].matchAll(/([^\s=/]+)(?:="([^"]*)"|='([^']*)')?/g)) attrs[a[1].toLowerCase()] = decoder(a[2] ?? a[3] ?? '');
    const el = new Noeud(tag, attrs, cur);
    cur.children.push(el);
    if (!VIDES.has(tag) && !/\/$/.test(m[3].trim())) cur = el;
  }
  return racine;
}
