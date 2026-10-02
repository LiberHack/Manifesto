<script setup lang="ts">
const route = useRoute();
const { data: page } = await useAsyncData(route.path, () =>
  queryCollection("legal").path(route.path).first()
);

if (!page.value) {
  throw createError({ statusCode: 404, statusMessage: "Page not found" });
}

useSeoMeta({ title: page.value.title });
</script>

<template>
  <div class="w-full flex justify-center py-12 px-4">
    <article class="w-full max-w-2xl min-w-0 bg-base-100/90 border-2 border-primary p-4 sm:p-8 overflow-x-auto [overflow-wrap:anywhere]">
      <ContentRenderer
        v-if="page"
        :value="page"
        class="prose prose-invert max-w-none
               prose-headings:font-black prose-headings:uppercase prose-headings:tracking-tight
               prose-h2:border-b prose-h2:border-primary prose-h2:pb-2
               prose-a:text-primary prose-a:no-underline hover:prose-a:underline
               prose-li:my-0"
      />
    </article>
  </div>
</template>
