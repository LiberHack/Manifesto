<script setup lang="ts">
useHead({
  title: "LiberHack",
  link: [{ rel: "icon", href: "/favicon.webp" }],
});

useSeoMeta({
  description: "The LiberHack burgas hackaton.",
  ogTitle: "LiberHack",
  ogDescription: "The LiberHack burgas hackaton",
  ogImage: "/favicon.webp",
  twitterCard: "summary_large_image",
});
</script>

<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>
