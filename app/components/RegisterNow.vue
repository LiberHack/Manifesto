<template>
  <button
    class="flex flex-col text-5xl font-black text-shadow-lg/80 text-shadow-4 p-2 transition-all ease-in-out duration-200 md:leading-[0.01] md:hover:leading-[0.5] leading-[0.5]"
    @mouseenter="startAnimation" @mouseleave="resetAnimation" @click="navigateRegister">
    <p v-for="i in 5" :key="i">{{ displayText }}</p>
    <p class="invisible h-0">{{ getGlitchVersion(displayText) }}</p>
  </button>
</template>

<script setup>
const originalText = "register now";
const displayText = ref(originalText);
let animationInterval = null;
let currentProgress = 0;
const DURATION = 30;

const router = useRouter()

const substitutions = {
  e: "3",
  o: "0",
  i: "1",
  l: "1",
  " ": "_",
};

const navigateRegister = () => router.push("/ops/register")

const getGlitchVersion = (text) => {
  return text
    .split("")
    .map((char) => {
      return substitutions[char.toLowerCase()] || char;
    })
    .join("");
};
const startAnimation = () => {
  let progress = 0;
  const maxProgress = originalText.length;
  animationInterval = setInterval(() => {
    progress++;
    currentProgress = progress;
    let result = "";
    for (let i = 0; i < originalText.length; i++) {
      if (i < progress) {
        result +=
          substitutions[originalText[i].toLowerCase()] || originalText[i];
      } else {
        result += originalText[i];
      }
    }
    displayText.value = result;
    if (progress >= maxProgress) {
      clearInterval(animationInterval);
    }
  }, DURATION);
};

const resetAnimation = () => {
  clearInterval(animationInterval);
  let progress = currentProgress;

  animationInterval = setInterval(() => {
    progress--;
    let result = "";
    for (let i = 0; i < originalText.length; i++) {
      if (i < progress) {
        result +=
          substitutions[originalText[i].toLowerCase()] || originalText[i];
      } else {
        result += originalText[i];
      }
    }
    displayText.value = result;
    if (progress <= 0) {
      clearInterval(animationInterval);
      displayText.value = originalText;
    }
  }, DURATION);
};
</script>
