<template>
  <div class="tarot-container" @contextmenu.prevent>
    
    <header class="table-header">
      <div class="controls-row">
        <div class="selector-group">
          <label for="deck-select">Deck:</label>
          <select id="deck-select" v-model="activeDeckId" @change="resetTable">
            <option v-for="deck in availableDecks" :key="deck.id" :value="deck.id">{{ deck.name }}</option>
          </select>
        </div>
        <div class="upload-group" v-if="activeDeckId === 'zip'">
          <label class="btn btn-secondary btn-sm" for="zip-upload">Load ZIP</label>
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
        <button class="btn btn-primary btn-sm" :disabled="isShuffling" @click="animateShuffle">
          {{ isShuffling ? 'Shuffling...' : 'Shuffle' }}
        </button>
      </div>

      <div class="controls-row">
        <div class="zoom-indicator">Zoom: {{ Math.round(zoomScale * 100) }}%</div>
        <button class="btn btn-secondary btn-sm" @click="isFanned = !isFanned">
          {{ isFanned ? 'Stack Deck' : 'Fan Deck' }}
        </button>
      </div>
    </header>

    <main 
      class="table-surface" 
      @wheel="onWheel"
      @pointerdown="onSurfacePointerDown"
      @pointermove="onSurfacePointerMove"
      @pointerup="onSurfacePointerUp"
      @pointercancel="onSurfacePointerUp"
    >
      
      <div 
        class="canvas-layer" 
        ref="canvasLayerRef" 
        :style="{ transform: `translate(${camera.x}px, ${camera.y}px) scale(${zoomScale})` }"
      >
        <div class="spread-layout" :class="`spread-${currentSpreadKey}`">
          <div v-for="(position, index) in currentSpread.positions" :key="'slot-'+index" class="spread-slot" :data-slot-index="index" :class="{'is-horizontal': currentSpreadKey === 'celticCross' && index === 1}">
            <div class="slot-label">{{ position }}</div>
            <div v-if="activeSpreadCards[index]" class="card-scene" @pointerdown="startDrag($event, index, 'spread')" @click="flipCard(activeSpreadCards[index])">
              <div class="card-object" :class="{ 'is-flipped': activeSpreadCards[index].tapState > 0, 'is-rotated': activeSpreadCards[index].tapState === 2 }">
                <div class="card-face card-back">
                  <div class="back-design">✦</div>
                  <img draggable="false" :src="getCardBackImage()" class="tarot-art card-back-img" @error="handleBackImageError($event)"/>
                </div>
                <div class="card-face card-front image-front">
                  <img draggable="false" :src="getCardImage(activeSpreadCards[index].id)" class="tarot-art" @error="handleImageError($event, activeSpreadCards[index].id)"/>
                </div>
              </div>
            </div>
            <div v-else class="slot-placeholder"></div>
          </div>
        </div>

        <div v-for="(looseCard, index) in looseCards" :key="'loose-'+looseCard.id" class="card-scene loose-card" :style="{ left: looseCard.x + 'px', top: looseCard.y + 'px', zIndex: 100 + index }" @pointerdown="startDrag($event, index, 'loose')" @click="flipCard(looseCard)">
          <div class="card-object" :class="{ 'is-flipped': looseCard.tapState > 0, 'is-rotated': looseCard.tapState === 2 }">
            <div class="card-face card-back">
              <div class="back-design">✦</div>
              <img draggable="false" :src="getCardBackImage()" class="tarot-art card-back-img" @error="handleBackImageError($event)"/>
            </div>
            <div class="card-face card-front image-front">
               <img draggable="false" :src="getCardImage(looseCard.id)" class="tarot-art" @error="handleImageError($event, looseCard.id)"/>
            </div>
          </div>
        </div>
      </div> 

      <div class="deck-area">
        <div class="deck-drawer" :class="{ 'is-open': isFanned }">
          <div class="deck-container" :class="{ 'is-fanned': isFanned }">
            <div v-for="(card, index) in deckPool" :key="card.id" class="card-scene deck-card" :style="getDeckCardStyle(card, index)" @pointerdown="startDrag($event, index, 'deck')">
              <div class="card-object">
                <div class="card-face card-back">
                  <div class="back-design">✦</div>
                  <img draggable="false" :src="getCardBackImage()" class="tarot-art card-back-img" @error="handleBackImageError($event)"/>
                </div>
              </div>
            </div>
            <div v-if="deckPool.length === 0" class="empty-deck-shadow"></div>
          </div>
          <div class="deck-label">Remaining: {{ deckPool.length }}</div>
        </div>
      </div>

    </main>
    
    <div v-if="drag.isActive && drag.cardData" class="drag-ghost" :style="ghostStyle">
      <div class="card-scene">
        <div class="card-object" :class="{ 'is-flipped': drag.cardData.tapState > 0, 'is-rotated': drag.cardData.tapState === 2 }">
          <div class="card-face card-back">
            <div class="back-design">✦</div>
            <img draggable="false" :src="getCardBackImage()" class="tarot-art card-back-img" @error="handleBackImageError($event)"/>
          </div>
          <div class="card-face card-front image-front">
            <img draggable="false" :src="getCardImage(drag.cardData.id)" class="tarot-art" @error="handleImageError($event, drag.cardData.id)" />
          </div>
        </div>
      </div>
    </div>

  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';

const availableDecks = [
  { id: 'standard', name: 'Standard (Rider-Waite)' },
  { id: 'vitoria', name: 'Vitoriushka' },
  { id: 'zip', name: 'Custom ZIP Upload' }
];
const activeDeckId = ref('vitoria');

const majorArcana = Array.from({ length: 22 }, (_, i) => ({
  id: i.toString().padStart(2, '0'),
  name: `Archetype ${i}`
}));

const spreads = {
  free: { name: 'Free Spread (Sandbox)', positions: [] },
  single: { name: 'Single Focus', positions: ['Insight'] },
  threeCard: { name: 'Three Fates', positions: ['Past', 'Present', 'Future'] },
  celticCross: { name: 'Celtic Cross', positions: ['1. The Heart', '2. The Challenge', '3. The Root', '4. The Past', '5. The Crown', '6. The Future', '7. The Self', '8. Environment', '9. Hopes/Fears', '10. Outcome'] }
};

const currentSpreadKey = ref('free');
const currentSpread = computed(() => spreads[currentSpreadKey.value]);

const deckPool = ref([]);
const activeSpreadCards = ref([]);
const looseCards = ref([]);
const isShuffling = ref(false);
const isFanned = ref(false);

const customZipImages = ref({});

// --- Camera & Zoom Physics ---
const zoomScale = ref(1.0);
const camera = ref({ x: 0, y: 0 });
const canvasLayerRef = ref(null);

// Pointer Tracking State
const activePointers = ref(new Map());
const isPanning = ref(false);
let panStart = { x: 0, y: 0 };
let cameraStart = { x: 0, y: 0 };
let initialPinchDist = -1;
let initialZoom = 1;

const onWheel = (event) => {
  event.preventDefault();
  const zoomDelta = event.deltaY * -0.001;
  zoomScale.value = Math.min(Math.max(0.2, zoomScale.value + zoomDelta), 2.0);
};

const onSurfacePointerDown = (e) => {
  activePointers.value.set(e.pointerId, e);

  if (activePointers.value.size === 2) {
    if (drag.value.isActive) cleanupDrag();
    
    const pts = Array.from(activePointers.value.values());
    const dx = pts[0].clientX - pts[1].clientX;
    const dy = pts[0].clientY - pts[1].clientY;
    initialPinchDist = Math.sqrt(dx * dx + dy * dy);
    initialZoom = zoomScale.value;

    const avgX = (pts[0].clientX + pts[1].clientX) / 2;
    const avgY = (pts[0].clientY + pts[1].clientY) / 2;
    panStart = { x: avgX, y: avgY };
    cameraStart = { x: camera.value.x, y: camera.value.y };
    isPanning.value = true;
    return;
  }

  if (activePointers.value.size === 1) {
    const isMiddleClick = e.button === 1;
    const isBackground = !e.target.closest('.card-scene') && !e.target.closest('.deck-area') && !e.target.closest('.table-header');

    if (isMiddleClick || isBackground) {
      if (drag.value.isActive) cleanupDrag(); 
      isPanning.value = true;
      panStart = { x: e.clientX, y: e.clientY };
      cameraStart = { x: camera.value.x, y: camera.value.y };
    }
  }
};

const onSurfacePointerMove = (e) => {
  if (activePointers.value.has(e.pointerId)) {
    activePointers.value.set(e.pointerId, e);
  }
  
  if (activePointers.value.size === 2) {
    const pts = Array.from(activePointers.value.values());
    const dx = pts[0].clientX - pts[1].clientX;
    const dy = pts[0].clientY - pts[1].clientY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (initialPinchDist > 0) {
      const ratio = dist / initialPinchDist;
      zoomScale.value = Math.min(Math.max(0.2, initialZoom * ratio), 2.0);
    }

    const avgX = (pts[0].clientX + pts[1].clientX) / 2;
    const avgY = (pts[0].clientY + pts[1].clientY) / 2;
    camera.value.x = cameraStart.x + (avgX - panStart.x);
    camera.value.y = cameraStart.y + (avgY - panStart.y);

  } else if (isPanning.value && activePointers.value.size === 1) {
    camera.value.x = cameraStart.x + (e.clientX - panStart.x);
    camera.value.y = cameraStart.y + (e.clientY - panStart.y);
  }
};

const onSurfacePointerUp = (e) => {
  activePointers.value.delete(e.pointerId);
  
  if (activePointers.value.size < 2) {
    initialPinchDist = -1;
  }
  
  if (activePointers.value.size === 0) {
    isPanning.value = false;
  } else if (activePointers.value.size === 1) {
    const pt = Array.from(activePointers.value.values())[0];
    panStart = { x: pt.clientX, y: pt.clientY };
    cameraStart = { x: camera.value.x, y: camera.value.y };
  }
};
// ---------------------------

const getCardImage = (cardId) => {
  if (activeDeckId.value === 'zip' && customZipImages.value[cardId]) return customZipImages.value[cardId];
  return `/decks/${activeDeckId.value}/${cardId}.webp`;
};

const handleImageError = (e, cardId) => {
  const fallback = `/decks/standard/${cardId}.webp`;
  if (!e.target.src.includes(fallback)) e.target.src = fallback;
};

// --- Back of Card Artwork Handling ---
const getCardBackImage = () => {
  if (activeDeckId.value === 'zip' && customZipImages.value['back']) return customZipImages.value['back'];
  return `/decks/${activeDeckId.value}/back.webp`;
};

const handleBackImageError = (e) => {
  const fallback = `/decks/standard/back.webp`;
  if (!e.target.src.includes(fallback)) {
    e.target.src = fallback;
  } else {
    // If the image fails entirely, hide it so the CSS star gradient shows
    e.target.style.display = 'none';
  }
};

const handleZipUpload = (event) => { console.log("ZIP Selected:", event.target.files[0]?.name); };

// --- Drag Mechanics ---
const drag = ref({ isActive: false, source: null, sourceIndex: null, cardData: null, mouseX: 0, mouseY: 0 });

const cleanupDrag = () => {
  window.removeEventListener('pointermove', onDragMove);
  window.removeEventListener('pointerup', onDragEnd);
  drag.value.isActive = false;
};

const startDrag = (event, index, source) => {
  if (isShuffling.value) return;
  if (event.button === 1) return; 
  if (activePointers.value.size >= 2) return; 
  if (source === 'deck' && !isFanned.value && index !== deckPool.value.length - 1) return;

  let pickedCard;
  if (source === 'deck') pickedCard = deckPool.value[index];
  if (source === 'spread') pickedCard = activeSpreadCards.value[index];
  if (source === 'loose') pickedCard = looseCards.value[index];

  drag.value = {
    isActive: true, source, sourceIndex: index, cardData: pickedCard, mouseX: event.clientX, mouseY: event.clientY
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
    left: `${drag.value.mouseX - (70 * zoomScale.value)}px`,
    top: `${drag.value.mouseY - (121 * zoomScale.value)}px`,
    transform: `scale(${zoomScale.value})`,
    transformOrigin: 'top left'
  };
});

const onDragEnd = (event) => {
  cleanupDrag();

  const dropTarget = document.elementFromPoint(event.clientX, event.clientY)?.closest('.spread-slot');
  const canvasRect = canvasLayerRef.value?.getBoundingClientRect() || { left: 0, top: 0 };

  const card = drag.value.cardData;
  if (drag.value.source === 'deck') deckPool.value.splice(drag.value.sourceIndex, 1);
  if (drag.value.source === 'spread') activeSpreadCards.value[drag.value.sourceIndex] = null;
  if (drag.value.source === 'loose') looseCards.value.splice(drag.value.sourceIndex, 1);

  if (dropTarget) {
    const slotIndex = parseInt(dropTarget.getAttribute('data-slot-index'), 10);
    if (activeSpreadCards.value[slotIndex] !== null) {
      const ejectedCard = activeSpreadCards.value[slotIndex];
      looseCards.value.push({ ...ejectedCard, x: (Math.random() * 100) + 20, y: (Math.random() * 100) + 20 });
    }
    activeSpreadCards.value[slotIndex] = card;
  } else {
    let dropX = (event.clientX - canvasRect.left) / zoomScale.value - 70;
    let dropY = (event.clientY - canvasRect.top) / zoomScale.value - 121;
    looseCards.value.push({ ...card, x: dropX, y: dropY });
  }

  if (deckPool.value.length === 0) isFanned.value = false;
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
      zIndex: index, transition: 'transform 0.4s cubic-bezier(0.25, 0.8, 0.25, 1)'
    };
  }
  const stackOffset = (deckPool.value.length - 1 - index) * -0.5;
  return { transform: `translate(${stackOffset}px, ${stackOffset}px)`, zIndex: index, transition: 'transform 0.3s ease' };
};

const flipCard = (card) => { card.tapState = (card.tapState + 1) % 4; };

const initDeck = () => {
  deckPool.value = majorArcana.map(card => ({ ...card, tapState: 0, scatterX: 0, scatterY: 0, scatterRot: 0 }));
  activeSpreadCards.value = new Array(currentSpread.value.positions.length).fill(null);
  looseCards.value = [];
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
    card.tapState = 0;
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
  zoomScale.value = 1.0;
  camera.value = { x: 0, y: 0 };
};

onMounted(() => { resetTable(); });
</script>

<style scoped>
/* 1. Lighter Pure CSS Mystical Background */
.tarot-container { 
  min-height: 100vh; 
  background-color: #3b3b4f; 
  background-image: 
    radial-gradient(circle at 20% 20%, rgba(138, 120, 160, 0.15) 0%, transparent 50%),
    radial-gradient(circle at 80% 80%, rgba(90, 130, 160, 0.15) 0%, transparent 50%),
    radial-gradient(circle at 50% 50%, #4a4a60 0%, #202028 100%);
  display: flex; 
  flex-direction: column; 
  overflow: hidden; 
  touch-action: none; 
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
}

.tarot-container select { user-select: auto; }

.table-surface { 
  flex-grow: 1; 
  position: relative; 
  width: 100%; 
  display: flex; 
  flex-direction: column; 
  align-items: center; 
}

.canvas-layer {
  position: absolute;
  top: 0; left: 0; width: 100%; height: 100%;
  transform-origin: 0 0; 
  transition: transform 0.05s linear; 
}

/* Redesigned Header for extra controls */
.table-header {
  width: 100%; max-width: 900px; display: flex; flex-wrap: wrap; justify-content: center; align-items: center; gap: 1.5rem;
  background: #1a1a1a; padding: 1rem 1.5rem; border-radius: 12px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4); border: 1px solid #2a2a2a; margin-bottom: 2rem; z-index: 10;
}

.selector-group { display: flex; align-items: center; gap: 1rem; color: #e0e0e0; }
select { background: #262626; color: #d4af37; border: 1px solid #404040; padding: 0.5rem; border-radius: 6px; }

.btn { padding: 0.65rem 1.25rem; font-size: 0.95rem; font-weight: 600; border-radius: 6px; cursor: pointer; border: none; }
.btn-primary { background: #d4af37; color: #121212; }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-sm { padding: 0.4rem 0.8rem; font-size: 0.85rem; }

.zoom-indicator { color: #aaa; font-size: 0.85rem; font-family: monospace; background: rgba(0,0,0,0.5); padding: 0.4rem 0.8rem; border-radius: 6px; }

.drag-ghost { position: fixed; pointer-events: none; z-index: 9999; filter: drop-shadow(0 15px 30px rgba(0,0,0,0.8)); }
.loose-card { position: absolute; cursor: grab; }

.spread-layout { display: flex; flex-wrap: wrap; gap: 1.5rem; justify-content: center; padding: 2rem; width: 100%; }

.spread-celticCross { display: grid; grid-template-columns: repeat(4, minmax(140px, 165px)); grid-template-rows: repeat(4, auto); gap: 1.5rem; max-width: 900px; }
.spread-celticCross .spread-slot[data-slot-index="0"] { grid-column: 2; grid-row: 2; z-index: 1; }
.spread-celticCross .spread-slot[data-slot-index="1"] { grid-column: 2; grid-row: 2; z-index: 2; pointer-events: none; }
.spread-celticCross .spread-slot[data-slot-index="1"] .card-scene { pointer-events: auto; }
.spread-celticCross .spread-slot[data-slot-index="1"] .slot-placeholder { border-color: transparent; background: transparent; }
.spread-celticCross .spread-slot[data-slot-index="1"] .slot-label { display: none; }
.spread-celticCross .spread-slot.is-horizontal .card-scene { transform: rotate(-90deg); }
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

/* 3. The Re-positioned Drawer */
.deck-area { 
  position: absolute; bottom: 0; width: 100%; 
  display: flex; flex-direction: column; align-items: center; z-index: 200; pointer-events: none; 
}

.deck-drawer {
  display: flex; flex-direction: column; align-items: center; gap: 1rem;
  /* Hides the vast majority of the deck off-screen when stacked */
  transform: translateY(180px); 
  transition: transform 0.4s cubic-bezier(0.25, 0.8, 0.25, 1);
  pointer-events: auto; 
}
@media (min-width: 400px) { .deck-drawer { transform: translateY(200px); } }

/* Slides up slightly when opened to reveal the top half of the fan */
.deck-drawer.is-open { transform: translateY(100px); }
@media (min-width: 400px) { .deck-drawer.is-open { transform: translateY(120px); } }

.deck-container { position: relative; width: 140px; height: 242px; touch-action: none; }
@media (min-width: 400px) { .deck-container { width: 165px; height: 285px; } }
.deck-container.is-fanned .deck-card { cursor: grab; }
.empty-deck-shadow { width: 100%; height: 100%; border: 1px solid #333; border-radius: 12px; background: rgba(0,0,0,0.2); }
.deck-card { position: absolute; top: 0; left: 0; touch-action: none; cursor: grab; }
.deck-card:active { cursor: grabbing; }
.deck-label { color: #aaa; font-size: 0.9rem; letter-spacing: 0.05em; text-shadow: 0 2px 4px rgba(0,0,0,0.8); }

.card-scene { width: 140px; height: 242px; perspective: 1000px; }
@media (min-width: 400px) { .card-scene { width: 165px; height: 285px; } }

.card-object { width: 100%; height: 100%; position: relative; transition: transform 0.6s cubic-bezier(0.25, 0.8, 0.25, 1); transform-style: preserve-3d; transform: rotateY(0deg) rotateZ(0deg); }
.card-object.is-flipped { transform: rotateY(180deg) rotateZ(0deg); }
.card-object.is-flipped.is-rotated { transform: rotateY(180deg) rotateZ(90deg); }

.card-face { position: absolute; width: 100%; height: 100%; backface-visibility: hidden; border-radius: 12px; display: flex; flex-direction: column; align-items: center; justify-content: center; box-shadow: -2px 4px 8px rgba(0, 0, 0, 0.6); border: 1px solid #2d2d2d; }
.card-back { background: radial-gradient(circle, #1a1a2e 0%, #0a0a0f 100%); color: #d4af37; font-size: 2.5rem; }

/* The Back Artwork Image Layer */
.card-back-img {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 2; /* Sits above the pure CSS design */
  object-fit: cover;
  border-radius: inherit;
}

.back-design { border: 1px solid rgba(212, 175, 55, 0.2); width: calc(100% - 16px); height: calc(100% - 16px); border-radius: 8px; display: flex; align-items: center; justify-content: center; }
.card-front { background: #fbf9f5; color: #1c1a17; transform: rotateY(180deg); padding: 1.25rem; text-align: center; border: 4px double #d4af37; cursor: pointer; }
.image-front { padding: 0; border: none; background: #000; overflow: hidden; }

.tarot-art { width: 100%; height: 100%; object-fit: cover; pointer-events: none; border-radius: inherit; -webkit-user-drag: none; user-drag: none; }

.upload-group { display: flex; align-items: center; }
.controls-row { display: flex; gap: 1rem; align-items: center; justify-content: center; }
</style>