<script setup lang="ts">
import ProseTable from "~/components/ProseTable.vue";
import { labelContentTableCells } from "~/utils/contentTables";

const { data: page } = await useAsyncData("order", () =>
  queryCollection("order").path("/order").first(),
);

if (!page.value) {
  throw createError({ statusCode: 404, statusMessage: "Page not found" });
}

labelContentTableCells(page.value.body);

useSeoMeta({ title: "Ред на презентациите — LiberHack" });
</script>

<template>
  <div
    class="w-full min-w-0 flex flex-col gap-12 py-8 font-cygrotesk px-4 sm:px-6 md:px-32 lg:px-64 xl:px-96 [overflow-wrap:break-word]"
  >
    <div
      class="min-w-0 flex flex-col gap-4 bg-base-100/80 border-primary border-4 p-4 sm:p-6 md:p-10"
    >
      <h1
        class="text-3xl sm:text-4xl md:text-6xl font-bold text-shadow-lg/80 text-shadow-4 wrap-break-word"
      >
        Ред на презентациите
      </h1>
      <p class="text-xl md:text-2xl opacity-80">
        Редът, по който отборите ще презентират проектите си.
      </p>
    </div>

    <div class="min-w-0 bg-base-100/90 border-2 border-primary/40 p-4 sm:p-6 md:p-10">
      <ContentRenderer
        v-if="page"
        :value="page"
        :components="{ table: ProseTable }"
        class="prose prose-invert max-w-none prose-headings:font-black prose-headings:uppercase prose-headings:tracking-tight prose-h2:text-primary prose-h2:border-b-2 prose-h2:border-primary prose-h2:pb-2 prose-h2:mt-10 prose-table:border-collapse prose-table:w-full prose-table:min-w-[32rem] prose-th:border prose-th:border-primary/60 prose-th:p-3 prose-th:bg-primary/20 prose-th:text-left prose-td:border prose-td:border-primary/30 prose-td:p-3 prose-tr:even:bg-base-100/60 prose-strong:text-primary prose-a:text-primary prose-a:no-underline hover:prose-a:underline"
      />
    </div>

    <div class="flex justify-center pb-8">
      <NuxtLink
        to="/"
        class="text-sm underline opacity-60 hover:opacity-100 font-cygrotesk"
      >
        ← обратно към началото
      </NuxtLink>
    </div>
  </div>
</template>
