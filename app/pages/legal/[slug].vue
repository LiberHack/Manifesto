<script setup lang="ts">
import { labelContentTableCells } from "~/utils/contentTables";

const route = useRoute();
const { data: page } = await useAsyncData(route.path, () =>
  queryCollection("legal").path(route.path).first()
);

if (!page.value) {
  throw createError({ statusCode: 404, statusMessage: "Page not found" });
}

labelContentTableCells(page.value.body);

useSeoMeta({ title: page.value.title });
</script>

<template>
  <div class="w-full flex justify-center py-12 px-4">
    <article class="w-full max-w-2xl min-w-0 bg-base-100/90 border-2 border-primary p-4 sm:p-8 [overflow-wrap:break-word]">
      <ContentRenderer
        v-if="page"
        :value="page"
       
        class="prose prose-invert max-w-none
               prose-headings:font-black prose-headings:uppercase prose-headings:tracking-tight
               prose-h1:text-2xl sm:prose-h1:text-4xl prose-h2:text-xl sm:prose-h2:text-2xl
               prose-h2:border-b prose-h2:border-primary prose-h2:pb-2
               prose-a:text-primary prose-a:no-underline hover:prose-a:underline
               prose-li:my-0"
      />
    </article>
  </div>
</template>
