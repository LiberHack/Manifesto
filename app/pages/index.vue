<template>
  <div class="w-full flex flex-col gap-16 py-8 font-cygrotesk">
    <div
      class="w-full flex flex-col md:flex-row items-center justify-center gap-5"
    >
      <NuxtImg
        preload
        src="/favicon.webp"
        class="bg-base-100/90 border-primary border-4"
      />
      <div class="w-2/3 md:w-1/4">
        <p
          class="text-5xl font-bold text-center text-shadow-lg/80 text-shadow-4"
        >
          Your Future Is In YOUR Hands
        </p>
      </div>
    </div>

    <div class="w-full flex flex-col gap-8 items-center">
      <p class="text-6xl font-bold">Ass0c1at3s</p>
      <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div v-for="i in 4" class="flex flex-col items-center gap-2">
          <NuxtImg
            preload
            src="/favicon.webp"
            class="bg-base-100/90 border-primary border-4"
          />
          <p class="font-bold text-2xl bg-base-100/80 border-primary border-2">
            {SUBJECT NAME HERE}
          </p>
        </div>
      </div>
    </div>

    <div
      class="w-full flex flex-col justify-center align-middle items-center gap-8 p-8"
    >
      <p class="text-5xl font-bold text-center">Fr3qu3nt!y A5k3d Qu3st10n5</p>
      <div class="flex flex-row w-full gap-8">
        <NuxtImg
          preload
          src="/favicon.webp"
          class="bg-base-100/90 border-primary border-4"
        />

        <FAQ class="h-min" />
      </div>
    </div>

    <div
      class="w-full h-96 flex flex-row justify-center align-middle items-center gap-8 p-8"
    >
      <RegisterNow />
      <NuxtImg
        preload
        src="/favicon.webp"
        class="bg-base-100/90 border-primary border-4 hidden md:block"
      />
    </div>
    <p>hallo</p>

    <Footer />
  </div>
</template>
