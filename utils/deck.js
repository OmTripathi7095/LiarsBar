// utils/deck.js

function buildDeck() {
  const deck = [];
  ['A','K','Q'].forEach(rank => {
    for (let i = 0; i < 6; i++) deck.push(rank);
  });
  for (let i = 0; i < 2; i++) deck.push('JOKER');
  return deck;
}

function shuffle(deck) {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function deal(deck, players, handSize = 5) {
  const hands = {};
  const d = deck.slice();
  players.forEach(username => {
    hands[username] = d.splice(0, handSize);
  });
  return { hands, deck: d };
}

module.exports = { buildDeck, shuffle, deal };
