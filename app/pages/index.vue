<template>
  <div class="w-full flex flex-col gap-16 py-8 font-cygrotesk md:px-32">
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
          class="text-2xl lg:text-5xl font-bold text-center text-shadow-lg/80 text-shadow-4"
        >
          Your Future Is In YOUR Hands
        </p>
      </div>
    </div>

    <div class="w-full flex flex-col gap-8 items-center">
      <p class="text-3xl lg:text-6xl font-bold items-stretch">Ass0c1at3s</p>
      <div class="flex flex-col lg:flex-row gap-16">
        <div class="flex flex-col items-center gap-2">
          <div>
            <NuxtImg
              preload
              src="/burgaslab.png"
              class="bg-base-100/90 border-primary border-4 h-24 md:h-42 w-full"
            />
          </div>
          <p
            class="font-bold text-xl md:text-2xl bg-base-100/80 border-primary border-2 p-2"
          >
            BurgasLab
          </p>
        </div>
        <div class="flex flex-col items-center gap-2">
          <div>
            <NuxtImg
              preload
              src="/ppmg.jpg"
              class="bg-base-100/90 border-primary border-4 h-24 md:h-42 w-full"
            />
          </div>
          <p
            class="font-bold text-xl md:text-2xl bg-base-100/80 border-primary border-2 p-2"
          >
            PPMG
          </p>
        </div>
        <div class="flex flex-col items-center gap-2">
          <div>
            <NuxtImg
              preload
              src="/vladan.jpg"
              class="bg-base-100/90 border-primary border-4 h-24 md:h-42 w-full"
            />
          </div>
          <p
            class="font-bold text-xl md:text-2xl bg-base-100/80 border-primary border-2 p-2"
          >
            VLADAN OOD
          </p>
        </div>
      </div>
    </div>

    <div
      class="w-full flex flex-col justify-center align-middle items-center gap-8 p-8"
    >
      <p class="text-3xl lg:text-5xl font-bold text-center">
        Fr3qu3nt!y A5k3d Qu3st10n5
      </p>
      <div class="flex flex-col lg:flex-row w-full p-8 gap-8 md:gap-24">
        <div class="flex items-center justify-center">
          <NuxtImg
            preload
            src="/pc.webp"
            class="bg-base-100/90 border-primary border-4 rendering-pixelated w-lg"
          />
        </div>

        <FAQ class="h-min" />
      </div>
    </div>

    <div
      class="w-full h-96 flex flex-row justify-center align-middle items-center gap-8 p-8 md:p-24"
    >
      <RegisterNow />
      <NuxtImg
        preload
        src="/eyes.webp"
        class="bg-base-100/90 border-primary border-4 w-xs hidden md:block"
      />
    </div>

    <Footer />
  </div>
</template>
