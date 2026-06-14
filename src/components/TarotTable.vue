<template>
  <div class="tarot-container">
    <header class="table-header">
      <div class="controls-row">
        <div class="selector-group">
          <label for="deck-select">Deck:</label>
          <select id="deck-select" v-model="activeDeckId" @change="resetTable">
            <option v-for="deck in availableDecks" :key="deck.id" :value="deck.id">{{ deck.name }}</option>
          </select>
        </div>

        <div class="upload-group" v-if="activeDeckId === 'zip'">
          <label class="btn btn-secondary btn-sm" for="zip-upload">Load ZIP into RAM</label>
          <input type="file" id="zip-upload" accept=".zip" hidden @change="handleZipUpload" />
        </div>
      </div>

      <div class="controls-row">
        <div class="selector-group">
          <label for="spread-select">Spread:</label>
          <select id="spread-select" v-model="currentSpreadKey" @change="resetTable">
            <option v-for="(spread, key) in spreads" :key="key" :value="key">{{ spread.name }}</option>
          </select>
        </div>
        <button class="btn btn-primary" :disabled="isShuffling" @click="animateShuffle">
          {{ isShuffling ? 'Shuffling...' : 'Shuffle Deck' }}
        </button>
      </div>
    </header>

    <main class="table-surface" ref="tableSurfaceRef">
      
      <div class="spread-layout" :class="`spread-${currentSpreadKey}`">
        <div 
          v-for="(position, index) in currentSpread.positions" 
          :key="'slot-'+index" 
          class="spread-slot" 
          :data-slot-index="index"
          :class="{'is-horizontal': currentSpreadKey === 'celticCross' && index === 1}"
        >
          <div class="slot-label">{{ position }}</div>
          
          <div 
            v-if="activeSpreadCards[index]" 
            class="card-scene" 
            @pointerdown.stop="startDrag($event, index, 'spread')"
            @click.stop="flipCard(activeSpreadCards[index])"
          >
            <div class="card-object" :class="{ 'is-flipped': activeSpreadCards[index].isFlipped }">
              <div class="card-face card-back"><div class="back-design">✦</div></div>
              <div class="card-face card-front image-front">
                <img :src="getCardImage(activeSpreadCards[index].id)" class="tarot-art" @error="handleImageError($event, activeSpreadCards[index].id)"/>
              </div>
            </div>
          </div>
          <div v-else class="slot-placeholder"></div>
        </div>
      </div>

      <div 
        v-for="(looseCard, index) in looseCards" 
        :key="'loose-'+looseCard.id"
        class="card-scene loose-card"
        :style="{ left: looseCard.x + 'px', top: looseCard.y + 'px', zIndex: 100 + index }"
        @pointerdown.stop="startDrag($event, index, 'loose')"
        @click.stop="flipCard(looseCard)"
      >
        <div class="card-object" :class="{ 'is-flipped': looseCard.isFlipped }">
          <div class="card-face card-back"><div class="back-design">✦</div></div>
          <div class="card-face card-front image-front">
             <img :src="getCardImage(looseCard.id)" class="tarot-art" @error="handleImageError($event, looseCard.id)"/>
          </div>
        </div>
      </div>

      <div class="deck-area">
        <button class="btn btn-secondary btn-sm fan-toggle" @click="isFanned = !isFanned">
          {{ isFanned ? 'Stack Deck' : 'Fan Deck' }}
        </button>

        <div class="deck-container" :class="{ 'is-fanned': isFanned }" @pointerdown="handleDeckPointer">
          <div 
            v-for="(card, index) in deckPool" 
            :key="card.id"
            class="card-scene deck-card"
            :style="getDeckCardStyle(card, index)"
            @pointerdown.stop="startDrag($event, index, 'deck')"
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
    
    <div v-if="drag.isActive && drag.cardData" class="drag-ghost" :style="ghostStyle">
      <div class="card-scene">
        <div class="card-object" :class="{ 'is-flipped': drag.cardData.isFlipped }">
          <div class="card-face card-back"><div class="back-design">✦</div></div>
          <div class="card-face card-front image-front">
            <img :src="getCardImage(drag.cardData.id)" class="tarot-art" @error="handleImageError($event, drag.cardData.id)"/>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';

// --- State & Config ---
const availableDecks = [
  { id: 'standard', name: 'Standard (Rider-Waite)' },
  { id: 'vitoria', name: 'Vitoriushka' },
  { id: 'zip', name: 'Custom ZIP Upload' }
];
const activeDeckId = ref('standard');

const majorArcana = Array.from({ length: 22 }, (_, i) => ({
  id: i.toString().padStart(2, '0'),
  name: `Archetype ${i}`
}));

const spreads = {
  single: { name: 'Single Focus', positions: ['Insight'] },
  threeCard: { name: 'Three Fates', positions: ['Past', 'Present', 'Future'] },
  celticCross: { 
    name: 'Celtic Cross', 
    positions: ['1. The Heart', '2. The Challenge', '3. The Root', '4. The Past', '5. The Crown', '6. The Future', '7. The Self', '8. Environment', '9. Hopes/Fears', '10. Outcome'] 
  }
};

const currentSpreadKey = ref('threeCard');
const currentSpread = computed(() => spreads[currentSpreadKey.value]);

const deckPool = ref([]);
const activeSpreadCards = ref([]);
const looseCards = ref([]);
const isShuffling = ref(false);
const isFanned = ref(false);

const tableSurfaceRef = ref(null);

// --- Image Fallback Logic ---
const customZipImages = ref({});

const getCardImage = (cardId) => {
  if (activeDeckId.value === 'zip') {
    if (customZipImages.value[cardId]) return customZipImages.value[cardId];
    return `/decks/standard/${cardId}.webp`;
  }
  return `/decks/${activeDeckId.value}/${cardId}.webp`;
};

const handleImageError = (e, cardId) => {
  const fallback = `/decks/standard/${cardId}.webp`;
  if (!e.target.src.includes(fallback)) e.target.src = fallback;
};

const handleZipUpload = (event) => {
  console.log("ZIP Selected:", event.target.files[0]?.name);
  // Future JSZip logic goes here
};

// --- Drag & Drop Physics Engine ---
const drag = ref({
  isActive: false,
  source: null,
  sourceIndex: null,
  cardData: null,
  mouseX: 0,
  mouseY: 0
});

const handleDeckPointer = (event) => {
  if (event.button === 1) {
    event.preventDefault();
    isFanned.value = !isFanned.value;
  }
};

const startDrag = (event, index, source) => {
  if (isShuffling.value) return;
  if (source === 'deck' && !isFanned.value && index !== deckPool.value.length - 1) return;

  let pickedCard;
  if (source === 'deck') pickedCard = deckPool.value[index];
  if (source === 'spread') pickedCard = activeSpreadCards.value[index];
  if (source === 'loose') pickedCard = looseCards.value[index];

  drag.value = {
    isActive: true,
    source,
    sourceIndex: index,
    cardData: pickedCard,
    mouseX: event.clientX,
    mouseY: event.clientY
  };

  window.addEventListener('pointermove', onDragMove);
  window.addEventListener('pointerup', onDragEnd);
};

const onDragMove = (event) => {
  if (!drag.value.isActive) return;
  drag.value.mouseX = event.clientX;
  drag.value.mouseY = event.clientY;
};

const ghostStyle = computed(() => {
  if (!drag.value.isActive) return {};
  return {
    left: `${drag.value.mouseX - 70}px`,
    top: `${drag.value.mouseY - 121}px`,
  };
});

const onDragEnd = (event) => {
  window.removeEventListener('pointermove', onDragMove);
  window.removeEventListener('pointerup', onDragEnd);
  
  if (!drag.value.isActive) return;

  const dropTarget = document.elementFromPoint(event.clientX, event.clientY)?.closest('.spread-slot');
  const tableRect = tableSurfaceRef.value?.getBoundingClientRect() || { left: 0, top: 0 };

  const card = drag.value.cardData;
  if (drag.value.source === 'deck') deckPool.value.splice(drag.value.sourceIndex, 1);
  if (drag.value.source === 'spread') activeSpreadCards.value[drag.value.sourceIndex] = null;
  if (drag.value.source === 'loose') looseCards.value.splice(drag.value.sourceIndex, 1);

  if (dropTarget) {
    const slotIndex = parseInt(dropTarget.getAttribute('data-slot-index'), 10);
    if (activeSpreadCards.value[slotIndex] !== null) {
      const ejectedCard = activeSpreadCards.value[slotIndex];
      looseCards.value.push({
        ...ejectedCard,
        x: (Math.random() * 100) + 20,
        y: (Math.random() * 100) + 20
      });
    }
    activeSpreadCards.value[slotIndex] = card;
  } else {
    let dropX = event.clientX - tableRect.left - 70;
    let dropY = event.clientY - tableRect.top - 121;
    looseCards.value.push({ ...card, x: dropX, y: dropY });
  }

  if (deckPool.value.length === 0) isFanned.value = false;
  drag.value.isActive = false;
};

const getDeckCardStyle = (card, index) => {
  if (drag.value.isActive && drag.value.source === 'deck' && drag.value.sourceIndex === index) {
    return { opacity: 0 };
  }

  if (isShuffling.value) {
    return { transform: `translate(${card.scatterX}px, ${card.scatterY}px) rotate(${card.scatterRot}deg)`, zIndex: index };
  }

  if (isFanned.value) {
    const total = deckPool.value.length;
    const center = total / 2;
    const offset = index - center;
    const spreadWidth = Math.min(25, 800 / total);
    
    return {
      transform: `translateX(${offset * spreadWidth}px) translateY(${Math.abs(offset) * 2}px) rotate(${offset * 1.5}deg)`,
      zIndex: index,
      transition: 'transform 0.4s cubic-bezier(0.25, 0.8, 0.25, 1)'
    };
  }

  const stackOffset = (deckPool.value.length - 1 - index) * -0.5;
  return { transform: `translate(${stackOffset}px, ${stackOffset}px)`, zIndex: index, transition: 'transform 0.3s ease' };
};

const flipCard = (card) => { card.isFlipped = !card.isFlipped; };

// --- Logic properly ordered for Vue's compiler ---
const initDeck = () => {
  deckPool.value = majorArcana.map(card => ({ ...card, isFlipped: false, scatterX: 0, scatterY: 0, scatterRot: 0 }));
  activeSpreadCards.value = new Array(currentSpread.value.positions.length).fill(null);
  looseCards.value = []; // Clear the table on init
  isFanned.value = false;
};

const animateShuffle = () => {
  if (isShuffling.value) return;
  isShuffling.value = true;
  
  const allCards = [...deckPool.value, ...activeSpreadCards.value.filter(c => c !== null), ...looseCards.value];
  deckPool.value = allCards;
  activeSpreadCards.value = new Array(currentSpread.value.positions.length).fill(null);
  looseCards.value = [];

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

const resetTable = () => {
  initDeck();
  animateShuffle();
};

// Start the table properly on component load!
onMounted(() => {
  resetTable();
});
</script>

<style scoped>
/* Core layout */
.tarot-container { min-height: 100vh; background-color: #121212; display: flex; flex-direction: column; overflow: hidden; }
.table-surface { flex-grow: 1; position: relative; width: 100%; display: flex; flex-direction: column; align-items: center; }

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

.selector-group { display: flex; align-items: center; gap: 1rem; color: #e0e0e0; }
select { background: #262626; color: #d4af37; border: 1px solid #404040; padding: 0.5rem; border-radius: 6px; }

.btn { padding: 0.65rem 1.25rem; font-size: 0.95rem; font-weight: 600; border-radius: 6px; cursor: pointer; border: none; }
.btn-primary { background: #d4af37; color: #121212; }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }

/* The Ghost Card */
.drag-ghost { position: fixed; pointer-events: none; z-index: 9999; filter: drop-shadow(0 10px 20px rgba(0,0,0,0.5)); }

/* Loose cards */
.loose-card { position: absolute; cursor: grab; }

/* Spread Container */
.spread-layout { display: flex; flex-wrap: wrap; gap: 1.5rem; justify-content: center; padding: 2rem; width: 100%; }

/* --- CELTIC CROSS --- */
.spread-celticCross { display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; grid-template-rows: 1fr 1fr 1fr 1fr; gap: 1rem; max-width: 800px; }
.spread-celticCross .spread-slot[data-slot-index="0"] { grid-column: 2; grid-row: 2; z-index: 1; }
.spread-celticCross .spread-slot[data-slot-index="1"] { grid-column: 2; grid-row: 2; z-index: 2; }
.spread-celticCross .spread-slot.is-horizontal .card-scene { transform: rotate(-90deg); }
.spread-celticCross .spread-slot.is-horizontal .slot-placeholder { transform: rotate(-90deg); }
.spread-celticCross .spread-slot[data-slot-index="2"] { grid-column: 2; grid-row: 3; }
.spread-celticCross .spread-slot[data-slot-index="3"] { grid-column: 1; grid-row: 2; }
.spread-celticCross .spread-slot[data-slot-index="4"] { grid-column: 2; grid-row: 1; }
.spread-celticCross .spread-slot[data-slot-index="5"] { grid-column: 3; grid-row: 2; }
.spread-celticCross .spread-slot[data-slot-index="6"] { grid-column: 4; grid-row: 4; }
.spread-celticCross .spread-slot[data-slot-index="7"] { grid-column: 4; grid-row: 3; }
.spread-celticCross .spread-slot[data-slot-index="8"] { grid-column: 4; grid-row: 2; }
.spread-celticCross .spread-slot[data-slot-index="9"] { grid-column: 4; grid-row: 1; }

.spread-slot { display: flex; flex-direction: column; align-items: center; gap: 0.75rem; }
.slot-label { font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.1em; color: #aaa; text-align: center; }

.slot-placeholder {
  width: 140px; height: 242px; border: 2px dashed #444; border-radius: 12px;
  display: flex; align-items: center; justify-content: center; color: #555; background: rgba(255, 255, 255, 0.02);
}

@media (min-width: 400px) { .slot-placeholder { width: 165px; height: 285px; } }

/* Physical Deck Zone */
.deck-area { display: flex; flex-direction: column; align-items: center; gap: 1rem; margin-top: auto; padding-bottom: 2rem; z-index: 200; }
.fan-toggle { margin-bottom: 1rem; }
.deck-container { position: relative; width: 140px; height: 242px; touch-action: none; }
@media (min-width: 400px) { .deck-container { width: 165px; height: 285px; } }
.deck-container.is-fanned .deck-card { cursor: grab; }
.empty-deck-shadow { width: 100%; height: 100%; border: 1px solid #333; border-radius: 12px; background: rgba(0,0,0,0.2); }
.deck-card { position: absolute; top: 0; left: 0; touch-action: none; cursor: grab; }
.deck-card:active { cursor: grabbing; }
.deck-label { color: #666; font-size: 0.9rem; letter-spacing: 0.05em; }

/* Shared Card Geometry */
.card-scene { width: 140px; height: 242px; perspective: 1000px; }
@media (min-width: 400px) { .card-scene { width: 165px; height: 285px; } }
.card-object { width: 100%; height: 100%; position: relative; transition: transform 0.6s cubic-bezier(0.25, 0.8, 0.25, 1); transform-style: preserve-3d; }
.card-object.is-flipped { transform: rotateY(180deg); }
.card-face { position: absolute; width: 100%; height: 100%; backface-visibility: hidden; border-radius: 12px; display: flex; flex-direction: column; align-items: center; justify-content: center; box-shadow: -2px 4px 8px rgba(0, 0, 0, 0.6); border: 1px solid #2d2d2d; }
.card-back { background: radial-gradient(circle, #1a1a2e 0%, #0a0a0f 100%); color: #d4af37; font-size: 2.5rem; }
.back-design { border: 1px solid rgba(212, 175, 55, 0.2); width: calc(100% - 16px); height: calc(100% - 16px); border-radius: 8px; display: flex; align-items: center; justify-content: center; }
.card-front { background: #fbf9f5; color: #1c1a17; transform: rotateY(180deg); padding: 1.25rem; text-align: center; border: 4px double #d4af37; cursor: pointer; }
.image-front { padding: 0; border: none; background: #000; overflow: hidden; }
.tarot-art { width: 100%; height: 100%; object-fit: cover; pointer-events: none; border-radius: inherit; }

.upload-group { display: flex; align-items: center; }
.btn-sm { padding: 0.4rem 0.8rem; font-size: 0.85rem; }

.controls-row { display: flex; flex-wrap: wrap; gap: 1rem; align-items: center; justify-content: center; width: 100%; }
@media (min-width: 600px) { .controls-row { width: auto; justify-content: flex-start; } }
</style>