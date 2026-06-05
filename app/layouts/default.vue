<script setup>
const route = useRoute();
const appConfig = useAppConfig();
const noShader = computed(() => route.path === "/reglament");
const discord = appConfig.socials.discord;
const instagram = appConfig.socials.instagram;
</script>

<template>
  <ClientOnly>
    <ScanlineShader v-if="!noShader" />
  </ClientOnly>

  <div
    class="shader-container w-full min-h-screen bg-[url('/index.webp')] bg-repeat bg-auto font-cygrotesk"
  >
    <div class="flex flex-col min-h-screen">
      <div
        class="navbar bg-base-100 shadow-sm border-b-2 border-primary gap-2 px-4"
      >
        <div class="flex flex-row flex-wrap">
          <div class="">
            <NuxtLink
              to="/"
              class="btn btn-ghost text-xs md:text-lg lg:text-xl font-cy"
              :class="{ 'btn-active btn-primary': route.path === '/' }"
            >
              L1BERH4CK
            </NuxtLink>
          </div>

          <div class="">
            <NuxtLink
              to="/ops/teams"
              class="btn btn-ghost font-cy text-xs md:text-lg lg:text-xl"
              :class="{
                'btn-active btn-primary':
                  route.path.startsWith('/ops') === true,
              }"
            >
              OPS
            </NuxtLink>
          </div>

          <div class="">
            <NuxtLink
              to="/reglament"
              class="btn btn-ghost font-cy text-xs md:text-lg lg:text-xl"
              :class="{
                'btn-active btn-primary':
                  route.path.startsWith('/reglament') === true,
              }"
            >
              Reglament
            </NuxtLink>
          </div>

          <div class="">
            <NuxtLink
              to="/live"
              class="btn btn-ghost font-cy text-xs md:text-lg lg:text-xl"
              :class="{
                'btn-active btn-primary':
                  route.path.startsWith('/live') === true,
              }"
            >
              Live
            </NuxtLink>
          </div>
        </div>

        <div class="grow" />

        <div class="flex flex-row gap-4 h-full flex-none items-center">
          <a
            class="flex flex-row gap-2 items-center"
            :href="instagram"
            target="_blank"
          >
            <p class="hidden md:block">Instagram</p>
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
            <p class="hidden md:block">Discord</p>
            <Icon size="32" name="teenyicons:discord-solid" />
          </a>
        </div>
      </div>

      <AppBanners />
      <div class="flex flex-col flex-1 w-full">
        <slot />
      </div>
    </div>
  </div>
</template>
