<template>
  <div class="tarot-container">
    <header class="table-header">
      <div class="selector-group">
        <label for="spread-select">Choose Spread:</label>
        <select id="spread-select" v-model="currentSpreadKey" @change="resetTable">
          <option v-for="(spread, key) in spreads" :key="key" :value="key">
            {{ spread.name }} ({{ spread.positions.length }} {{ spread.positions.length === 1 ? 'Card' : 'Cards' }})
          </option>
        </select>
      </div>

      <div class="action-group">
        <button class="btn btn-primary" :disabled="isShuffling" @click="shuffleAndReset">
          {{ isShuffling ? 'Shuffling...' : 'Shuffle Deck' }}
        </button>
        <button 
          class="btn btn-secondary" 
          :disabled="activeSpreadCards.length >= currentSpread.positions.length || isShuffling" 
          @click="dealCard"
        >
          Deal Card
        </button>
      </div>
    </header>

    <main class="table-surface">
      <div class="spread-layout" :class="`spread-${currentSpreadKey}`">
        <div 
          v-for="(position, index) in currentSpread.positions" 
          :key="index" 
          class="spread-slot"
        >
          <div class="slot-label">{{ position }}</div>
          
          <div v-if="activeSpreadCards[index]" class="card-scene" @click="flipCard(index)">
            <div class="card-object" :class="{ 'is-flipped': activeSpreadCards[index].isFlipped }">
              
              <div class="card-face card-back">
                <div class="back-design">✦</div>
              </div>
              
              <div class="card-face card-front">
                <span class="card-numeral">{{ activeSpreadCards[index].roman }}</span>
                <h2 class="card-title">{{ activeSpreadCards[index].name }}</h2>
              </div>

            </div>
          </div>
          <div v-else class="slot-placeholder">
            <span>?</span>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';

// 1. Full 22 Major Arcana Dataset
const majorArcana = [
  { id: '00', roman: '0', name: 'The Fool' },
  { id: '01', roman: 'I', name: 'The Magician' },
  { id: '02', roman: 'II', name: 'The High Priestess' },
  { id: '03', roman: 'III', name: 'The Empress' },
  { id: '04', roman: 'IV', name: 'The Emperor' },
  { id: '05', roman: 'V', name: 'The Hierophant' },
  { id: '06', roman: 'VI', name: 'The Lovers' },
  { id: '07', roman: 'VII', name: 'The Chariot' },
  { id: '08', roman: 'VIII', name: 'Strength' },
  { id: '09', roman: 'IX', name: 'The Hermit' },
  { id: '10', roman: 'X', name: 'Wheel of Fortune' },
  { id: '11', roman: 'XI', name: 'Justice' },
  { id: '12', roman: 'XII', name: 'The Hanged Man' },
  { id: '13', roman: 'XIII', name: 'Death' },
  { id: '14', roman: 'XIV', name: 'Temperance' },
  { id: '15', roman: 'XV', name: 'The Devil' },
  { id: '16', roman: 'XVI', name: 'The Tower' },
  { id: '17', roman: 'XVII', name: 'The Star' },
  { id: '18', roman: 'XVIII', name: 'The Moon' },
  { id: '19', roman: 'XIX', name: 'The Sun' },
  { id: '20', roman: 'XX', name: 'Judgement' },
  { id: '21', roman: 'XXI', name: 'The World' }
];

// 2. Defined Reading Spreads
const spreads = {
  single: {
    name: 'Single Card',
    positions: ['Daily Energy / Core Focus']
  },
  threeCard: {
    name: 'Three Fates',
    positions: ['Past', 'Present', 'Future']
  },
  mindBodySpirit: {
    name: 'Holistic Triad',
    positions: ['Mind (Conscious)', 'Body (Physical)', 'Spirit (Unconscious)']
  }
};

// 3. Reactive State
const currentSpreadKey = ref('threeCard');
const deckPool = ref([]);
const activeSpreadCards = ref([]);
const isShuffling = ref(false);

const currentSpread = computed(() => spreads[currentSpreadKey.value]);

// 4. Game Mechanics Logic
const initDeck = () => {
  deckPool.value = majorArcana.map(card => ({
    ...card,
    isFlipped: false
  }));
};

const shuffleAndReset = () => {
  isShuffling.value = true;
  // Clear the board first
  activeSpreadCards.value = [];
  
  // High-velocity Fisher-Yates shuffle
  initDeck();
  let currentIndex = deckPool.value.length;
  while (currentIndex !== 0) {
    const randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex--;
    [deckPool.value[currentIndex], deckPool.value[randomIndex]] = [
      deckPool.value[randomIndex], deckPool.value[currentIndex]
    ];
  }

  // Artificial delay to let mobile users register the shuffle state change visually
  setTimeout(() => {
    isShuffling.value = false;
  }, 400);
};

const dealCard = () => {
  if (deckPool.value.length === 0) return;
  if (activeSpreadCards.value.length >= currentSpread.value.positions.length) return;

  // Pull the top card off our virtual randomized deck
  const nextCard = deckPool.value.pop();
  activeSpreadCards.value.push(nextCard);
};

const flipCard = (index) => {
  activeSpreadCards.value[index].isFlipped = !activeSpreadCards.value[index].isFlipped;
};

const resetTable = () => {
  activeSpreadCards.value = [];
  shuffleAndReset();
};

// Auto-populate the table surface on initialization
initDeck();
shuffleAndReset();
</script>

<style scoped>
.tarot-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-height: 100vh;
  background-color: #121212;
  color: #e0e0e0;
  padding: 1.5rem;
  font-family: ui-serif, Georgia, Cambria, "Times New Roman", Times, serif;
  box-sizing: border-box;
}

.table-header {
  width: 100%;
  max-width: 800px;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  align-items: center;
  background: #1a1a1a;
  padding: 1.25rem;
  border-radius: 12px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
  border: 1px solid #2a2a2a;
  margin-bottom: 2rem;
}

@media (min-width: 600px) {
  .table-header {
    flex-direction: row;
    justify-content: space-between;
  }
}

.selector-group {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.selector-group label {
  font-size: 0.95rem;
  color: #b3b3b3;
}

select {
  background: #262626;
  color: #d4af37;
  border: 1px solid #404040;
  padding: 0.5rem 1rem;
  border-radius: 6px;
  font-size: 0.95rem;
  font-family: inherit;
  outline: none;
}

.action-group {
  display: flex;
  gap: 0.75rem;
  width: 100%;
}

@media (min-width: 600px) {
  .action-group {
    width: auto;
  }
}

.btn {
  flex: 1;
  padding: 0.65rem 1.25rem;
  font-size: 0.95rem;
  font-weight: 600;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
  border: none;
  text-align: center;
}

.btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.btn-primary {
  background: #d4af37;
  color: #121212;
}

.btn-primary:not(:disabled):hover {
  background: #f1c40f;
}

.btn-secondary {
  background: transparent;
  color: #d4af37;
  border: 1px solid #d4af37;
}

.btn-secondary:not(:disabled):hover {
  background: rgba(212, 175, 55, 0.1);
}

.table-surface {
  width: 100%;
  max-width: 1200px;
  display: flex;
  justify-content: center;
  flex-grow: 1;
}

/* Flexible Spread Layouts Container */
.spread-layout {
  display: flex;
  flex-wrap: wrap;
  gap: 1.5rem;
  justify-content: center;
  width: 100%;
}

.spread-slot {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
}

.slot-label {
  font-size: 0.85rem;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: #aaa;
  text-align: center;
  max-width: 150px;
  min-height: 2rem;
  display: flex;
  align-items: center;
}

/* Card Geometry & Aspect Ratios matching standard 2.75:4.75 */
.card-scene {
  width: 140px;
  height: 242px;
  perspective: 1000px;
  cursor: pointer;
}

@media (min-width: 400px) {
  .card-scene, .slot-placeholder {
    width: 165px;
    height: 285px;
  }
}

.slot-placeholder {
  width: 140px;
  height: 242px;
  border: 2px dashed #333;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #333;
  font-size: 2rem;
  background: rgba(255, 255, 255, 0.01);
}

.card-object {
  width: 100%;
  height: 100%;
  position: relative;
  transition: transform 0.6s cubic-bezier(0.25, 0.8, 0.25, 1);
  transform-style: preserve-3d;
}

.card-object.is-flipped {
  transform: rotateY(180deg);
}

.card-face {
  position: absolute;
  width: 100%;
  height: 100%;
  backface-visibility: hidden;
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.6);
  border: 1px solid #2d2d2d;
  box-sizing: border-box;
}

.card-back {
  background: radial-gradient(circle, #1a1a2e 0%, #0a0a0f 100%);
  color: #d4af37;
  font-size: 2.5rem;
}

.back-design {
  border: 1px solid rgba(212, 175, 55, 0.2);
  width: calc(100% - 16px);
  height: calc(100% - 16px);
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.card-front {
  background: #fbf9f5;
  color: #1c1a17;
  transform: rotateY(180deg);
  padding: 1.25rem;
  text-align: center;
  border: 4px double #d4af37;
}

.card-numeral {
  font-size: 1.1rem;
  color: #7f6c44;
  font-weight: 600;
  margin-bottom: auto;
}

.card-title {
  font-size: 1.25rem;
  margin-bottom: auto;
  font-weight: 500;
  line-height: 1.3;
}
</style>