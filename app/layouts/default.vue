<script setup>
const route = useRoute();
</script>

<template>
  <ClientOnly>
    <ScanlineShader />
  </ClientOnly>

  <div
    class="shader-container w-full min-h-screen bg-[url('/index.webp')] bg-repeat bg-auto font-cygrotesk"
  >
    <div class="flex flex-col min-h-screen">
      <div
        class="navbar bg-base-100 shadow-sm border-b-2 border-primary gap-2 px-4"
      >
        <div class="">
          <NuxtLink
            to="/"
            class="btn btn-ghost text-xl font-cy"
            :class="{ 'btn-active btn-primary': route.path === '/' }"
          >
            L1BERH4CK
          </NuxtLink>
        </div>

        <div class="">
          <NuxtLink
            to="/ops/teams"
            class="btn btn-ghost font-cy"
            :class="{
              'btn-active btn-primary': route.path.startsWith('/ops') === true,
            }"
          >
            OPS
          </NuxtLink>
        </div>
      </div>

      <div class="flex flex-col h-full w-full">
        <slot />
      </div>
    </div>
  </div>
</template>
