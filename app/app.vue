<script setup lang="ts">
useHead({
	title: "LiberHack",
	link: [{ rel: "icon", href: "/favicon.webp" }],
});

useSeoMeta({
	description: "LiberHack · Edition 2 — 48-часов хакатон за граждански технологии, 27-29 ноември 2026, Международен конгресен център Бургас.",
	ogTitle: "LiberHack",
	ogDescription: "LiberHack · Edition 2 — 48-часов хакатон за граждански технологии, 27-29 ноември 2026, Бургас",
	ogImage: "/favicon.webp",
	twitterCard: "summary_large_image",
});
</script>

<template>
	<NuxtLayout>
		<NuxtPage />
	</NuxtLayout>
</template>
