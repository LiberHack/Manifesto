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
      class="w-full flex flex-col gap-8 items-center justify-center text-shadow-lg/80 text-shadow-4"
    >
      <div class="w-fit">
        <p class="text-4xl text-center">
          Win it
          <span
            class="inline-block font-sans font-bold animate-wiggle overflow-visible"
            >B̶̪̐̇͑̇͜Ĩ̴̭̺Ḡ̸̛̥̯͍̋</span
          >
        </p>
      </div>

      <div
        class="flex flex-col md:flex-row gap-8 items-center md:items-end justify-center w-full mx-auto"
      >
        <div class="w-full md:w-auto flex justify-center order-2 md:order-1">
          <div
            class="flex flex-col items-center justify-center bg-success/50 p-4 md:py-8"
          >
            <div class="flex flex-row gap-4 items-center justify-center">
              <span class="drop-shadow-[0_8px_8px_rgba(0,0,0,0.8)]">
                <Icon size="48" name="game-icons:chess-queen" />
              </span>
              <p class="font-bold text-4xl">2nd</p>
            </div>
            <p class="font-bold text-4xl text-center">300 EURO</p>
          </div>
        </div>

        <div class="w-full md:w-auto flex justify-center order-1 md:order-2">
          <div
            class="flex flex-col items-center justify-center bg-primary/50 p-4 md:py-8"
          >
            <div class="flex flex-row gap-4 items-center justify-center">
              <span class="drop-shadow-[0_8px_8px_rgba(0,0,0,0.8)]">
                <Icon size="64" name="game-icons:chess-king" />
              </span>
              <p class="font-bold text-4xl">1st</p>
            </div>
            <p class="font-bold text-4xl text-center">500 EURO</p>
          </div>
        </div>

        <div class="w-full md:w-auto flex justify-center order-3">
          <div
            class="flex flex-col items-center justify-center bg-warning/50 p-4 md:py-6"
          >
            <div class="flex flex-row gap-4 items-center justify-center">
              <span class="drop-shadow-[0_8px_8px_rgba(0,0,0,0.8)]">
                <Icon size="48" name="game-icons:chess-rook" />
              </span>
              <p class="font-bold text-4xl">3rd</p>
            </div>
            <p class="font-bold text-4xl text-center">100 EURO</p>
          </div>
        </div>
      </div>

      <div class="w-fit">
        <p class="text-xl text-center px-2">
          + Best projects in each category receive an €100 prize.
        </p>
      </div>
    </div>

    <div
      class="w-full flex flex-row justify-center align-middle items-center gap-8 p-8"
    >
      <NuxtImg
        preload
        src="/eyes.webp"
        class="bg-base-100/90 border-primary border-4 w-xs hidden md:block lg:w-md"
      />
      <div class="flex flex-col items-center gap-4">
        <RegisterNow />
        <NuxtLink
          to="/reglament"
          class="text-sm underline opacity-60 hover:opacity-100"
        >
          прочети регламента →
        </NuxtLink>
      </div>
    </div>

    <div class="w-full flex flex-col gap-12 items-center">
      <p
        class="text-3xl lg:text-6xl font-bold items-stretch text-shadow-lg/80 text-shadow-4"
      >
        Ass0c1at3s
      </p>

      <!-- Platinum -->
      <div class="w-full flex flex-col gap-6 items-center">
        <div class="flex items-center gap-4 w-full max-w-4xl px-4">
          <div class="h-px flex-1 bg-slate-300/60" />
          <p class="text-slate-300 font-bold text-xl tracking-widest uppercase">Platinum</p>
          <div class="h-px flex-1 bg-slate-300/60" />
        </div>
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-10 items-center w-full max-w-2xl px-4">
          <div class="flex flex-col items-center gap-2">
            <NuxtImg preload src="/burgas.jpg" class="bg-base-100/90 border-slate-300 border-4 w-full object-contain" />
            <p class="font-bold text-xl md:text-2xl bg-base-100/80 border-slate-300 border-2 p-2 text-center w-full">Burgas Municipality</p>
          </div>
          <div class="flex flex-col items-center gap-2">
            <NuxtImg preload src="/zonta.png" class="bg-white border-slate-300 border-4 w-full object-contain p-4" />
            <p class="font-bold text-xl md:text-2xl bg-base-100/80 border-slate-300 border-2 p-2 text-center w-full">Zonta</p>
          </div>
          <div class="flex flex-col items-center gap-2">
            <NuxtImg preload src="/telerik.png" class="bg-white border-slate-300 border-4 w-full object-contain" />
            <p class="font-bold text-xl md:text-2xl bg-base-100/80 border-slate-300 border-2 p-2 text-center w-full">Telerik</p>
          </div>
          <div class="flex flex-col items-center gap-2">
            <NuxtImg preload src="/flora-bar-and-grill.jpg" class="border-slate-300 border-4 w-full object-contain" />
            <p class="font-bold text-xl md:text-2xl bg-base-100/80 border-slate-300 border-2 p-2 text-center w-full">FLORA Bar&amp;Grill</p>
          </div>
        </div>
      </div>

      <!-- Golden -->
      <div class="w-full flex flex-col gap-6 items-center">
        <div class="flex items-center gap-4 w-full max-w-4xl px-4">
          <div class="h-px flex-1 bg-yellow-500/60" />
          <p class="text-yellow-500 font-bold text-xl tracking-widest uppercase">Golden</p>
          <div class="h-px flex-1 bg-yellow-500/60" />
        </div>
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-10 items-center w-full max-w-2xl px-4">
          <div class="flex flex-col items-center gap-2">
            <NuxtImg preload src="/hell.webp" class="bg-base-100/90 border-primary border-4 w-full object-contain p-2" />
            <p class="font-bold text-xl md:text-2xl bg-base-100/80 border-primary border-2 p-2 text-center w-full">Hell</p>
          </div>
          <div class="flex flex-col items-center gap-2">
            <NuxtImg preload src="/scarabey.jpg" class="bg-white border-primary border-4 w-full object-contain p-6" />
            <p class="font-bold text-xl md:text-2xl bg-base-100/80 border-primary border-2 p-2 text-center w-full">Scarabey</p>
          </div>
        </div>
      </div>

      <!-- Silver -->
      <div class="w-full flex flex-col gap-6 items-center">
        <div class="flex items-center gap-4 w-full max-w-4xl px-4">
          <div class="h-px flex-1 bg-base-content/30" />
          <p class="text-base-content/60 font-bold text-xl tracking-widest uppercase">Silver</p>
          <div class="h-px flex-1 bg-base-content/30" />
        </div>
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-10 items-center w-full max-w-2xl px-4">
          <div class="flex flex-col items-center gap-2">
            <NuxtImg preload src="/vladan.jpg" class="bg-base-100/90 border-primary border-4 w-full object-contain" />
            <p class="font-bold text-xl md:text-2xl bg-base-100/80 border-primary border-2 p-2 text-center w-full">VLADAN OOD</p>
          </div>
          <div class="flex flex-col items-center gap-2">
            <NuxtImg preload src="/advance-bg.png" class="bg-base-100/90 border-primary border-4 h-24 md:h-42 w-full" />
            <p class="font-bold text-xl md:text-2xl bg-base-100/80 border-primary border-2 p-2 text-center w-full">Advance</p>
          </div>
        </div>
      </div>

      <!-- Partners -->
      <div class="w-full flex flex-col gap-6 items-center">
        <div class="flex items-center gap-4 w-full max-w-4xl px-4">
          <div class="h-px flex-1 bg-base-content/20" />
          <p class="text-base-content/40 font-bold text-xl tracking-widest uppercase">Partners</p>
          <div class="h-px flex-1 bg-base-content/20" />
        </div>
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-10 items-center w-full max-w-2xl px-4">
          <div class="flex flex-col items-center gap-2">
            <NuxtImg preload src="/burgaslab.png" class="bg-base-100/90 border-primary border-4 w-full object-contain" />
            <p class="font-bold text-xl md:text-2xl bg-base-100/80 border-primary border-2 p-2 text-center w-full">BurgasLab</p>
          </div>
          <div class="flex flex-col items-center gap-2">
            <NuxtImg preload src="/ppmg.jpg" class="bg-base-100/90 border-primary border-4 h-24 md:h-42 w-full object-contain" />
            <p class="font-bold text-xl md:text-2xl bg-base-100/80 border-primary border-2 p-2 text-center w-full">PPMG</p>
          </div>
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

<style scoped>
.animate-wiggle {
  /* Changed to linear for sharper, more sudden movements */
  animation: glitch-jerk 3s linear infinite;
}

@keyframes glitch-jerk {
  0%,
  70% {
    transform: translateX(0);
  }
  72% {
    transform: translateX(-3px);
  }
  74% {
    transform: translateX(0);
  }
  75% {
    transform: translateX(4px);
  }
  76% {
    transform: translateX(0);
  }
  88% {
    transform: translateX(2px);
  }
  90% {
    transform: translateX(-5px);
  }
  92%,
  100% {
    transform: translateX(0);
  }
}
</style>
