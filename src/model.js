// Modello del gioco: 2 strisce (A,B) di 2 posizioni ciascuna, alfabeto di 3 colori.
export const names = ['A','B'];
export const lengths = [2,2];
export const symbols = ['R','G','B']; // Rosso, Giallo(G), Blu — vedi COLORS per le etichette
export const COLORS = {R:{label:'Rosso',hex:'#c0392b'}, G:{label:'Giallo',hex:'#d4a017'}, B:{label:'Blu',hex:'#2456a6'}};
export const TOTAL = lengths.reduce((a,b)=>a+b,0);

const tuples = n => n ? tuples(n-1).flatMap(t => symbols.map(s => [...t,s])) : [[]];

// Righe di una striscia k ruotata di `rotation` colori: la prima posizione
// parte sempre dal primo simbolo e viene poi ruotata.
export function strip(k,rotation) {
  return tuples(lengths[k]-1).map(t => [symbols[0],...t].map(s => symbols[(symbols.indexOf(s)+rotation)%3]));
}
