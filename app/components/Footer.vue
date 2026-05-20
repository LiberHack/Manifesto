<script setup lang="js">
const appConfig = useAppConfig();
const discord = appConfig.socials.discord;
const instagram = appConfig.socials.instagram;
</script>

<template>
  <footer
    class="footer sm:footer-horizontal bg-base-100 text-neutral-content gap-0 border-2 border-primary"
  >
    <aside class="flex flex-row items-center border-2 border-primary p-2">
      <NuxtImg
        src="/favicon.webp"
        class="w-32 border-primary border-r-2 object-contain"
      />
      <p>LiberHack.</p>
    </aside>

    <div
      class="border-primary border-2 h-full p-2 flex flex-col justify-center"
    >
      <NuxtLink
        to="/reglament"
        class="font-bold underline hover:opacity-70 whitespace-nowrap"
      >
        Регламент →
      </NuxtLink>
    </div>

    <div
      class="border-primary border-2 h-full p-2 md:place-self-center md:justify-self-end w-full md:w-min"
    >
      <h1 class="text-3xl w-full">Social</h1>
      <div class="grid grid-flow-col gap-4 h-full w-full">
        <a
          class="flex flex-row gap-2 items-center"
          :href="instagram"
          target="_blank"
        >
          <p>Instagram</p>
          <Icon
            size="32"
            name="streamline-pixel:logo-social-media-old-instagram"
          />
        </a>
        <a
          :href="discord"
          class="flex flex-row gap-2 items-center"
          target="_blank"
        >
          <p>Discord</p>
          <Icon size="32" name="teenyicons:discord-solid" />
        </a>
      </div>
    </div>
  </footer>
</template>
