<template>
  <NuxtLink to="/programme">
    <button
      class="cursor-pointer flex flex-col text-3xl md:text-5xl font-black text-shadow-lg/80 text-shadow-4 p-2 transition-all ease-in-out duration-200 md:leading-[0.01] md:hover:leading-[0.5] leading-[0.5]"
      @mouseenter="startAnimation"
      @mouseleave="resetAnimation"
    >
      <p v-for="i in 5" :key="i">{{ displayText }}</p>
      <p class="invisible h-0">{{ getGlitchVersion(displayText) }}</p>
    </button>
  </NuxtLink>
</template>

<script setup>
const originalText = "view programme";
const displayText = ref(originalText);
let animationInterval = null;
let currentProgress = 0;
let isAnimating = false;
const DURATION = 30;

const substitutions = {
  e: "3",
  o: "0",
  i: "1",
  l: "1",
  " ": "_",
};

const getGlitchVersion = (text) => {
  return text
    .split("")
    .map((char) => substitutions[char.toLowerCase()] || char)
    .join("");
};

const clearAnimation = () => {
  if (animationInterval) {
    clearInterval(animationInterval);
    animationInterval = null;
  }
};

const startAnimation = () => {
  if (isAnimating) return;
  clearAnimation();
  isAnimating = true;
  let progress = 0;

  animationInterval = setInterval(() => {
    progress++;
    currentProgress = progress;
    let result = "";
    for (let i = 0; i < originalText.length; i++) {
      result +=
        i < progress
          ? substitutions[originalText[i].toLowerCase()] || originalText[i]
          : originalText[i];
    }
    displayText.value = result;
    if (progress >= originalText.length) {
      clearAnimation();
      isAnimating = false;
    }
  }, DURATION);
};

const resetAnimation = () => {
  clearAnimation();
  isAnimating = true;
  let progress = currentProgress;

  animationInterval = setInterval(() => {
    progress--;
    let result = "";
    for (let i = 0; i < originalText.length; i++) {
      result +=
        i < progress
          ? substitutions[originalText[i].toLowerCase()] || originalText[i]
          : originalText[i];
    }
    displayText.value = result;
    if (progress <= 0) {
      clearAnimation();
      displayText.value = originalText;
      isAnimating = false;
    }
  }, DURATION);
};
</script>
