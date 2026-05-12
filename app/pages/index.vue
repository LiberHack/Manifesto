<template>
  <div
    class="w-full flex flex-col gap-16 py-8 font-cygrotesk md:px-32 overflow-x-hidden"
  >
    <div
      class="w-full flex flex-col md:flex-row items-center justify-center gap-5"
    >
      <NuxtImg
        preload
        src="/favicon.webp"
        class="bg-base-100/90 border-primary border-4 w-xs lg:w-md"
      />
      <div class="lg:w-lg flex flex-col gap-5 bg-base-100/70">
        <p
          class="text-2xl lg:text-5xl font-bold text-center text-shadow-lg/80 text-shadow-4"
        >
          Your Future Is In YOUR Hands
        </p>
        <p
          class="text-lg font-bold text-center text-shadow-lg/80 text-shadow-4"
        >
          <span class="block">June 5–7</span>Social impact & Civic tech
          <span class="block underline">but make it punk</span>
        </p>
      </div>
    </div>

    <div
      class="w-full flex flex-col md:flex-row items-center justify-center gap-5"
    >
      <div class="flex flex-col gap-4 w-sm md:w-lg bg-base-100/70 p-4">
        <!-- <div
          class="text-2xl lg:text-5xl font-bold text-center text-shadow-lg/80 text-shadow-4 gap-2"
        >
          About
        </div> -->
        <div class="text-lg lg:text-4xl text-center flex flex-col gap-2">
          <span class="text-2xl lg:text-4xl">Build, pitch, and ship.</span>
          <span class="block text-xl"
            >48 hours to take your idea from zero to demo</span
          >
        </div>
      </div>
      <NuxtImg
        preload
        src="/holy.webp"
        class="bg-base-100/90 border-primary border-4 w-xs lg:w-md"
      />
    </div>

    <div
      class="w-full flex flex-row justify-center align-middle items-center gap-20 p-8"
    >
      <NuxtImg
        preload
        src="/eyes.webp"
        class="bg-base-100/90 border-primary border-4 w-xs hidden md:block lg:w-md"
      />
      <RegisterNow />
    </div>

    <div class="w-full flex flex-col gap-8 items-center">
      <p
        class="text-3xl lg:text-6xl font-bold items-stretch text-shadow-lg/80 text-shadow-4"
      >
        Ass0c1at3s
      </p>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
        <div class="flex flex-col items-center gap-2 px-8">
          <div>
            <NuxtImg
              preload
              src="/burgas.jpg"
              class="bg-base-100/90 border-primary border-4 w-full object-contain"
            />
          </div>
          <p
            class="font-bold text-xl md:text-2xl bg-base-100/80 border-primary border-2 p-2"
          >
            Burgas
          </p>
        </div>

        <div class="flex flex-col items-center gap-2 px-8">
          <div>
            <NuxtImg
              preload
              src="/hell.webp"
              class="bg-base-100/90 border-primary border-4 w-full object-contain p-2"
            />
          </div>
          <p
            class="font-bold text-xl md:text-2xl bg-base-100/80 border-primary border-2 p-2"
          >
            Hell
          </p>
        </div>

        <div class="flex flex-col items-center gap-2 px-8">
          <div>
            <NuxtImg
              preload
              src="/zonta.png"
              class="bg-base-100/90 border-primary border-4 w-full object-contain p-4"
            />
          </div>
          <p
            class="font-bold text-xl md:text-2xl bg-base-100/80 border-primary border-2 p-2"
          >
            Zonta
          </p>
        </div>

        <div class="flex flex-col items-center gap-2 px-8">
          <div>
            <NuxtImg
              preload
              src="/scarabey.jpg"
              class="bg-white border-primary border-4 w-full object-contain p-6"
            />
          </div>
          <p
            class="font-bold text-xl md:text-2xl bg-base-100/80 border-primary border-2 p-2"
          >
            Scarabey
          </p>
        </div>

        <div class="flex flex-col items-center gap-2 px-8">
          <div>
            <NuxtImg
              preload
              src="/burgaslab.png"
              class="bg-base-100/90 border-primary border-4 w-full object-contain"
            />
          </div>
          <p
            class="font-bold text-xl md:text-2xl bg-base-100/80 border-primary border-2 p-2"
          >
            BurgasLab
          </p>
        </div>

        <div class="flex flex-col items-center gap-2 px-8">
          <div>
            <NuxtImg
              preload
              src="/ppmg.jpg"
              class="bg-base-100/90 border-primary border-4 h-24 md:h-42 w-full object-contain"
            />
          </div>
          <p
            class="font-bold text-xl md:text-2xl bg-base-100/80 border-primary border-2 p-2"
          >
            PPMG
          </p>
        </div>

        <div class="flex flex-col items-center gap-2 px-8">
          <div>
            <NuxtImg
              preload
              src="/vladan.jpg"
              class="bg-base-100/90 border-primary border-4 w-full object-contain"
            />
          </div>
          <p
            class="font-bold text-xl md:text-2xl bg-base-100/80 border-primary border-2 p-2"
          >
            VLADAN OOD
          </p>
        </div>

        <div class="flex flex-col items-center gap-2 px-8">
          <div>
            <NuxtImg
              preload
              src="/advance-bg.png"
              class="bg-base-100/90 border-primary border-4 h-24 md:h-42 w-full"
            />
          </div>
          <p
            class="font-bold text-xl md:text-2xl bg-base-100/80 border-primary border-2 p-2"
          >
            Advance
          </p>
        </div>
      </div>
    </div>

    <div
      class="w-full flex flex-col justify-center align-middle items-center gap-8 p-8"
    >
      <p
        class="text-3xl lg:text-5xl font-bold text-center text-shadow-lg/80 text-shadow-4"
      >
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
    <Footer />
  </div>
</template>
