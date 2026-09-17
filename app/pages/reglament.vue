<script setup lang="ts">
const { data: page } = await useAsyncData("reglament", () =>
  queryCollection("reglament").path("/reglament").first(),
);

if (!page.value) {
  throw createError({ statusCode: 404, statusMessage: "Page not found" });
}

useSeoMeta({ title: "Регламент — LiberHack" });
</script>

<template>
  <div
    class="w-full flex flex-col gap-12 py-8 font-cygrotesk px-6 md:px-32 lg:px-64 xl:px-96 overflow-x-hidden"
  >
    <div
      class="flex flex-col gap-4 bg-base-100/80 border-primary border-4 p-6 md:p-10"
    >
      <h1
        class="text-4xl md:text-6xl font-bold text-shadow-lg/80 text-shadow-4"
      >
        {{ page?.title }}
      </h1>
      <p v-if="page?.edition" class="text-lg md:text-xl font-bold opacity-90">
        {{ page.edition }}
      </p>
      <p v-if="page?.tagline" class="text-xl md:text-2xl italic opacity-80">
        {{ page.tagline }}
      </p>
    </div>

    <ContentRenderer v-if="page" :value="page" class="flex flex-col gap-12" />

    <p v-if="page?.updated" class="text-xs opacity-40 text-right">
      Последна актуализация: {{ page.updated }}
    </p>
    <Footer />
  </div>
</template>
