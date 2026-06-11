<template>
  <div class="tarot-table">
    <header class="controls">
      <button class="btn" @click="shuffleDeck">Shuffle</button>
      <button class="btn btn-outline" @click="resetDeck">Gather Cards</button>
    </header>

    <main class="card-spread">
      <div 
        v-for="(card, index) in deck" 
        :key="card.id" 
        class="card-scene"
        @click="flipCard(index)"
      >
        <div class="card-object" :class="{ 'is-flipped': card.isFlipped }">
          
          <div class="card-face card-back">
            <div class="pattern">✦</div>
          </div>
          
          <div class="card-face card-front">
            <span class="roman-numeral">{{ card.roman }}</span>
            <h2 class="card-title">{{ card.name }}</h2>
          </div>

        </div>
      </div>
    </main>
  </div>
</template>

<script setup>
import { ref } from 'vue';

// MVP Text Deck: The foundational archetypes
const coreArchetypes = [
  { id: '00', roman: '0', name: 'The Fool' },
  { id: '01', roman: 'I', name: 'The Magician' },
  { id: '02', roman: 'II', name: 'The High Priestess' },
  { id: '03', roman: 'III', name: 'The Empress' },
  { id: '04', roman: 'IV', name: 'The Emperor' }
];

// Initialize deck state, injecting the 'isFlipped' reactivity
const deck = ref(coreArchetypes.map(card => ({ ...card, isFlipped: false })));

const flipCard = (index) => {
  deck.value[index].isFlipped = !deck.value[index].isFlipped;
};

const shuffleDeck = () => {
  // 1. Turn all cards face down
  deck.value.forEach(card => card.isFlipped = false);

  // 2. Wait for the CSS flip animation to finish, then shuffle the array
  setTimeout(() => {
    // Standard Fisher-Yates shuffle for a truly random distribution
    let currentIndex = deck.value.length;
    let randomIndex;
    while (currentIndex > 0) {
      randomIndex = Math.floor(Math.random() * currentIndex);
      currentIndex--;
      [deck.value[currentIndex], deck.value[randomIndex]] = [deck.value[randomIndex], deck.value[currentIndex]];
    }
  }, 600); // 600ms matches the CSS transition duration
};

const resetDeck = () => {
  deck.value = coreArchetypes.map(card => ({ ...card, isFlipped: false }));
};
</script>

<style scoped>
.tarot-table {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-height: 100vh;
  background-color: #1a1a1a;
  color: #f4f4f4;
  padding: 2rem;
  font-family: serif;
}

.controls {
  margin-bottom: 3rem;
  display: flex;
  gap: 1rem;
}

.btn {
  padding: 0.75rem 1.5rem;
  font-size: 1rem;
  cursor: pointer;
  background: #d4af37;
  color: #111;
  border: none;
  border-radius: 4px;
  font-weight: bold;
  transition: opacity 0.2s;
}

.btn:hover { opacity: 0.8; }
.btn-outline { background: transparent; color: #d4af37; border: 1px solid #d4af37; }

.card-spread {
  display: flex;
  flex-wrap: wrap;
  gap: 2rem;
  justify-content: center;
  max-width: 1000px;
}

/* 3D Scene Setup */
.card-scene {
  width: 165px;
  height: 285px;
  perspective: 1000px; /* Gives the 3D flip depth */
  cursor: pointer;
}

.card-object {
  width: 100%;
  height: 100%;
  position: relative;
  transition: transform 0.6s cubic-bezier(0.4, 0.2, 0.2, 1);
  transform-style: preserve-3d;
}

.card-object.is-flipped {
  transform: rotateY(180deg);
}

.card-face {
  position: absolute;
  width: 100%;
  height: 100%;
  backface-visibility: hidden; /* Hides the back of the element when facing away */
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 12px rgba(0,0,0,0.5);
  border: 2px solid #333;
}

.card-back {
  background: radial-gradient(circle, #2a2a4a 0%, #111 100%);
  color: #d4af37;
  font-size: 3rem;
}

.card-front {
  background: #fdfbf7;
  color: #1a1a1a;
  transform: rotateY(180deg); /* Pre-rotated to act as the back side of the 3D object */
  padding: 1rem;
  text-align: center;
}

.roman-numeral {
  font-size: 1.2rem;
  color: #666;
  margin-bottom: 1rem;
}

.card-title {
  font-size: 1.4rem;
  margin: 0;
  line-height: 1.2;
}
</style>