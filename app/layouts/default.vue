<template>
  <ClientOnly>
    <ScanlineShader />
  </ClientOnly>

  <div
    class="shader-container w-full min-h-screen bg-[url('/index.webp')] bg-repeat bg-auto"
  >
    <div class="flex flex-col min-h-screen">
      <div class="navbar bg-base-100 shadow-sm border-b-2 border-primary">
        <a class="btn btn-ghost text-xl font-cy">L1BERH4CK</a>
      </div>
      <div class="flex flex-col h-full w-full">
        <slot />
      </div>
    </div>
  </div>
</template>
