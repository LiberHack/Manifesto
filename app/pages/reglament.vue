<script setup lang="ts">
import ProseTable from "~/components/ProseTable.vue";
import { labelContentTableCells } from "~/utils/contentTables";

const { data: page } = await useAsyncData("reglament", () =>
  queryCollection("reglament").path("/reglament").first(),
);

if (!page.value) {
  throw createError({ statusCode: 404, statusMessage: "Page not found" });
}

labelContentTableCells(page.value.body);

useSeoMeta({ title: "Регламент — LiberHack" });
</script>

<template>
  <div
    class="w-full min-w-0 flex flex-col gap-12 py-8 font-cygrotesk px-4 sm:px-6 md:px-32 lg:px-64 xl:px-96 [overflow-wrap:break-word]"
  >
    <div
      class="min-w-0 flex flex-col gap-4 bg-base-100/80 border-primary border-4 p-4 sm:p-6 md:p-10"
    >
      <h1
        class="text-3xl sm:text-4xl md:text-6xl font-bold text-shadow-lg/80 text-shadow-4"
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

    <ContentRenderer v-if="page" :value="page" :components="{ table: ProseTable }" class="min-w-0 flex flex-col gap-12" />

    <p v-if="page?.updated" class="text-xs opacity-40 text-right">
      Последна актуализация: {{ page.updated }}
    </p>
    <Footer />
  </div>
</template>
