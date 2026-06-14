<template>
  <div class="tarot-container">
    <header class="table-header">
      <div class="upload-group">
        <label class="btn btn-secondary btn-sm" for="zip-upload">
          Upload Custom Deck (.zip)
        </label>
        <input type="file" id="zip-upload" accept=".zip" hidden @change="handleZipUpload" />
      </div>

      <div class="selector-group">
        <label for="spread-select">Spread:</label>
        <select id="spread-select" v-model="currentSpreadKey" @change="resetTable">
          <option v-for="(spread, key) in spreads" :key="key" :value="key">
            {{ spread.name }}
          </option>
        </select>
      </div>
      
      <button class="btn btn-primary" :disabled="isShuffling" @click="animateShuffle">
        {{ isShuffling ? 'Shuffling...' : 'Shuffle Deck' }}
      </button>
    </header>

    <main class="table-surface">
      <div class="spread-layout" :class="`spread-${currentSpreadKey}`">
        <div v-for="(position, index) in currentSpread.positions" :key="index" class="spread-slot" :data-slot-index="index">
          <div class="slot-label">{{ position }}</div>
          
          <div v-if="activeSpreadCards[index]" class="card-scene" @click="flipCard(index)">
            <div class="card-object" :class="{ 'is-flipped': activeSpreadCards[index].isFlipped }">
              <div class="card-face card-back"><div class="back-design">✦</div></div>
              
              <div class="card-face card-front image-front">
                <img 
                  :src="getCardImage(activeSpreadCards[index].id)" 
                  :alt="activeSpreadCards[index].name"
                  class="tarot-art"
                  @error="handleImageError($event, activeSpreadCards[index].id)"
                />
              </div>

            </div>
          </div>
          
          <div v-else class="slot-placeholder"><span>Drop Here</span></div>
        </div>
      </div>

      <div class="deck-area">
        <div class="deck-container">
          <div 
            v-for="(card, index) in deckPool" 
            :key="card.id"
            class="card-scene deck-card"
            :style="getCardStyle(card, index)"
            @pointerdown="startDrag($event, index)"
          >
            <div class="card-object">
              <div class="card-face card-back"><div class="back-design">✦</div></div>
            </div>
          </div>
          <div v-if="deckPool.length === 0" class="empty-deck-shadow"></div>
        </div>
        <div class="deck-label">Remaining: {{ deckPool.length }}</div>
      </div>
    </main>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';

// --- Image Fallback Engine ---

// 1. Store ZIP URLs in memory (Empty for now until we build JSZip)
const customZipImages = ref({}); 

// 2. The active template folder name inside public/decks/
const activeTemplate = ref('my_template'); 

const getCardImage = (cardId) => {
  // Tier 1: User uploaded a ZIP and it contains this specific card ID
  if (customZipImages.value[cardId]) {
    return customZipImages.value[cardId];
  }
  
  // Tier 2: Try the chosen template folder first (Served from Astro public folder)
  // We assume .webp here, but if it fails, the @error handler catches it
  return `/decks/${activeTemplate.value}/${cardId}.webp`;
};

const handleImageError = (event, cardId) => {
  // Tier 3 (The Ultimate Fallback): If the template image 404s, swap to standard RWS
  const standardFallback = `/decks/standard/${cardId}.webp`;
  
  // Prevent infinite loops if the standard image is ALSO missing
  if (event.target.src.includes(standardFallback)) return; 
  
  event.target.src = standardFallback;
};

const handleZipUpload = (event) => {
  console.log("File selected! We will hook up JSZip here next.");
};

// --- Standard Deck Logic (Unchanged from previous step) ---
const majorArcana = [
  { id: '00', roman: '0', name: 'The Fool' }, { id: '01', roman: 'I', name: 'The Magician' },
  { id: '02', roman: 'II', name: 'The High Priestess' }, { id: '03', roman: 'III', name: 'The Empress' },
  { id: '04', roman: 'IV', name: 'The Emperor' }, { id: '05', roman: 'V', name: 'The Hierophant' },
  { id: '06', roman: 'VI', name: 'The Lovers' }, { id: '07', roman: 'VII', name: 'The Chariot' },
  { id: '08', roman: 'VIII', name: 'Strength' }, { id: '09', roman: 'IX', name: 'The Hermit' },
  { id: '10', roman: 'X', name: 'Wheel of Fortune' }, { id: '11', roman: 'XI', name: 'Justice' },
  { id: '12', roman: 'XII', name: 'The Hanged Man' }, { id: '13', roman: 'XIII', name: 'Death' },
  { id: '14', roman: 'XIV', name: 'Temperance' }, { id: '15', roman: 'XV', name: 'The Devil' },
  { id: '16', roman: 'XVI', name: 'The Tower' }, { id: '17', roman: 'XVII', name: 'The Star' },
  { id: '18', roman: 'XVIII', name: 'The Moon' }, { id: '19', roman: 'XIX', name: 'The Sun' },
  { id: '20', roman: 'XX', name: 'Judgement' }, { id: '21', roman: 'XXI', name: 'The World' }
];

const spreads = {
  single: { name: 'Single Focus', positions: ['Insight'] },
  threeCard: { name: 'Three Fates', positions: ['Past', 'Present', 'Future'] },
  mindBodySpirit: { name: 'Holistic Triad', positions: ['Mind', 'Body', 'Spirit'] }
};

const currentSpreadKey = ref('threeCard');
const currentSpread = computed(() => spreads[currentSpreadKey.value]);

const deckPool = ref([]);
const activeSpreadCards = ref([]);
const isShuffling = ref(false);

const drag = ref({ isActive: false, cardIndex: null, startX: 0, startY: 0, deltaX: 0, deltaY: 0 });

const initDeck = () => {
  deckPool.value = majorArcana.map(card => ({ ...card, isFlipped: false, scatterX: 0, scatterY: 0, scatterRot: 0 }));
  activeSpreadCards.value = new Array(currentSpread.value.positions.length).fill(null);
};

const animateShuffle = () => {
  if (isShuffling.value) return;
  isShuffling.value = true;
  const allCards = [...deckPool.value, ...activeSpreadCards.value.filter(c => c !== null)];
  deckPool.value = allCards;
  activeSpreadCards.value = new Array(currentSpread.value.positions.length).fill(null);

  deckPool.value.forEach(card => {
    card.isFlipped = false;
    card.scatterX = (Math.random() - 0.5) * 200;
    card.scatterY = (Math.random() - 0.5) * 200;
    card.scatterRot = (Math.random() - 0.5) * 90;
  });

  setTimeout(() => {
    let currentIndex = deckPool.value.length;
    while (currentIndex !== 0) {
      const randomIndex = Math.floor(Math.random() * currentIndex);
      currentIndex--;
      [deckPool.value[currentIndex], deckPool.value[randomIndex]] = [deckPool.value[randomIndex], deckPool.value[currentIndex]];
    }
    deckPool.value.forEach(card => { card.scatterX = 0; card.scatterY = 0; card.scatterRot = 0; });
    setTimeout(() => { isShuffling.value = false; }, 400);
  }, 400);
};

const getCardStyle = (card, index) => {
  if (drag.value.isActive && drag.value.cardIndex === index) {
    return { transform: `translate(${drag.value.deltaX}px, ${drag.value.deltaY}px) scale(1.05)`, zIndex: 999, transition: 'none' };
  }
  if (isShuffling.value) {
    return { transform: `translate(${card.scatterX}px, ${card.scatterY}px) rotate(${card.scatterRot}deg)`, zIndex: index, transition: 'transform 0.4s cubic-bezier(0.25, 0.8, 0.25, 1)' };
  }
  const stackOffset = (deckPool.value.length - 1 - index) * -0.5;
  return { transform: `translate(${stackOffset}px, ${stackOffset}px)`, zIndex: index, transition: 'transform 0.3s ease' };
};

const startDrag = (event, index) => {
  if (index !== deckPool.value.length - 1 || isShuffling.value) return;
  const el = event.currentTarget;
  el.setPointerCapture(event.pointerId);
  drag.value = { isActive: true, cardIndex: index, startX: event.clientX, startY: event.clientY, deltaX: 0, deltaY: 0 };
  el.addEventListener('pointermove', onDragMove);
  el.addEventListener('pointerup', onDragEnd);
};

const onDragMove = (event) => {
  if (!drag.value.isActive) return;
  drag.value.deltaX = event.clientX - drag.value.startX;
  drag.value.deltaY = event.clientY - drag.value.startY;
};

const onDragEnd = (event) => {
  const el = event.currentTarget;
  el.removeEventListener('pointermove', onDragMove);
  el.removeEventListener('pointerup', onDragEnd);
  el.releasePointerCapture(event.pointerId);
  el.style.visibility = 'hidden';
  const dropTarget = document.elementFromPoint(event.clientX, event.clientY)?.closest('.spread-slot');
  el.style.visibility = 'visible';

  if (dropTarget) {
    const slotIndex = parseInt(dropTarget.getAttribute('data-slot-index'), 10);
    if (activeSpreadCards.value[slotIndex] === null) {
      activeSpreadCards.value[slotIndex] = deckPool.value.pop();
    }
  }
  drag.value = { isActive: false, cardIndex: null, startX: 0, startY: 0, deltaX: 0, deltaY: 0 };
};

const flipCard = (index) => {
  if (activeSpreadCards.value[index]) {
    activeSpreadCards.value[index].isFlipped = !activeSpreadCards.value[index].isFlipped;
  }
};

const resetTable = () => { initDeck(); animateShuffle(); };

initDeck();
setTimeout(animateShuffle, 100);
</script>

<style scoped>
/* Core layout retains the dark, focused atmosphere */
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
  overflow: hidden; /* Prevent body scrolling during drag */
}

.table-header {
  width: 100%;
  max-width: 800px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: #1a1a1a;
  padding: 1rem 1.5rem;
  border-radius: 12px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
  border: 1px solid #2a2a2a;
  margin-bottom: 2rem;
  z-index: 10;
}

.selector-group { display: flex; align-items: center; gap: 1rem; }
select { background: #262626; color: #d4af37; border: 1px solid #404040; padding: 0.5rem; border-radius: 6px; }

.btn {
  padding: 0.65rem 1.25rem;
  font-size: 0.95rem;
  font-weight: 600;
  border-radius: 6px;
  cursor: pointer;
  border: none;
}
.btn-primary { background: #d4af37; color: #121212; }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }

.table-surface {
  width: 100%;
  max-width: 1000px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3rem;
  flex-grow: 1;
}

/* Spread Drop Zones */
.spread-layout {
  display: flex;
  flex-wrap: wrap;
  gap: 1.5rem;
  justify-content: center;
  width: 100%;
  min-height: 320px;
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
}

.slot-placeholder {
  width: 140px;
  height: 242px;
  border: 2px dashed #444;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #555;
  font-size: 1rem;
  background: rgba(255, 255, 255, 0.02);
  transition: background 0.2s;
}

@media (min-width: 400px) {
  .slot-placeholder { width: 165px; height: 285px; }
}

/* Physical Deck Zone */
.deck-area {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
  margin-top: auto;
  padding-bottom: 2rem;
}

.deck-container {
  position: relative;
  width: 140px;
  height: 242px;
}

@media (min-width: 400px) {
  .deck-container { width: 165px; height: 285px; }
}

.empty-deck-shadow {
  width: 100%;
  height: 100%;
  border: 1px solid #333;
  border-radius: 12px;
  background: rgba(0,0,0,0.2);
}

.deck-card {
  position: absolute;
  top: 0;
  left: 0;
  /* CRITICAL: touch-action: none prevents the mobile browser from scrolling the page when you try to drag the card */
  touch-action: none; 
  cursor: grab;
}

.deck-card:active {
  cursor: grabbing;
}

.deck-label {
  color: #666;
  font-size: 0.9rem;
  letter-spacing: 0.05em;
}

/* Shared Card Geometry */
.card-scene {
  width: 140px;
  height: 242px;
  perspective: 1000px;
}

@media (min-width: 400px) {
  .card-scene { width: 165px; height: 285px; }
}

.card-object {
  width: 100%;
  height: 100%;
  position: relative;
  transition: transform 0.6s cubic-bezier(0.25, 0.8, 0.25, 1);
  transform-style: preserve-3d;
}

.card-object.is-flipped { transform: rotateY(180deg); }

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
  box-shadow: -2px 4px 8px rgba(0, 0, 0, 0.6);
  border: 1px solid #2d2d2d;
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
  cursor: pointer;
}

.card-numeral { font-size: 1.1rem; color: #7f6c44; font-weight: 600; margin-bottom: auto; }
.card-title { font-size: 1.25rem; margin-bottom: auto; font-weight: 500; }

/* Update the front face to remove text padding and accept images */
.image-front {
  padding: 0;
  border: none;
  background: #000; /* Dark background behind images */
  overflow: hidden; /* Ensure rounded corners clip the image */
}

.tarot-art {
  width: 100%;
  height: 100%;
  object-fit: cover; /* Ensures the image fills the card, cropping edges if aspect ratio is slightly off */
  pointer-events: none; /* Prevents ghost-dragging the image element itself */
  border-radius: inherit; /* Matches the card-face rounded corners */
}

/* Small styling for the new upload button */
.upload-group {
  display: flex;
  align-items: center;
}
.btn-sm {
  padding: 0.4rem 0.8rem;
  font-size: 0.85rem;
}
</style>