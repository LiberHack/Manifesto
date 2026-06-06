<script setup lang="ts">
const { data: page } = await useAsyncData("programme", () =>
  queryCollection("programme").path("/programme").first(),
);

if (!page.value) {
  throw createError({ statusCode: 404, statusMessage: "Page not found" });
}

useSeoMeta({ title: "Програма — LiberHack" });
</script>

<template>
  <div
    class="w-full flex flex-col gap-12 py-8 font-cygrotesk px-6 md:px-32 lg:px-64 xl:px-96 overflow-x-hidden"
  >
    <div
      class="flex flex-col gap-4 bg-base-100/80 border-primary border-4 p-6 md:p-10"
    >
      <div class="flex items-start justify-between gap-4 flex-wrap">
        <h1
          class="text-4xl md:text-6xl font-bold text-shadow-lg/80 text-shadow-4 wrap-break-word"
        >
          Програма
        </h1>
        <div class="flex flex-col items-end gap-1 shrink-0">
          <NuxtLink
            to="/live"
            class="px-5 py-2 font-black uppercase tracking-widest text-sm text-black transition-colors"
            style="background: var(--color-primary)"
          >
            → LIVE
          </NuxtLink>
          <span
            class="text-[0.65rem] uppercase tracking-widest opacity-60 font-bold"
            >Следи на живо</span
          >
        </div>
      </div>
      <p class="text-xl md:text-2xl opacity-80">
        5, 6 и 7 юни - ~48 часа от петък следобед до неделя на обяд.
      </p>
    </div>

    <div class="bg-base-100/90 border-2 border-primary/40 p-6 md:p-10">
      <ContentRenderer
        v-if="page"
        :value="page"
        class="prose prose-invert max-w-none prose-headings:font-black prose-headings:uppercase prose-headings:tracking-tight prose-h2:text-primary prose-h2:border-b-2 prose-h2:border-primary prose-h2:pb-2 prose-h2:mt-10 prose-table:border-collapse prose-table:w-full prose-th:border prose-th:border-primary/60 prose-th:p-3 prose-th:bg-primary/20 prose-th:text-left prose-td:border prose-td:border-primary/30 prose-td:p-3 prose-tr:even:bg-base-100/60 prose-strong:text-primary prose-a:text-primary prose-a:no-underline hover:prose-a:underline"
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
