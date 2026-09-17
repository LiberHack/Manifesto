<template>
  <div
    class="w-full flex flex-col gap-12 py-8 font-cygrotesk px-6 md:px-32 lg:px-64 xl:px-96 overflow-x-hidden"
  >
    <div
      class="flex flex-col gap-4 bg-base-100/80 border-primary border-4 p-6 md:p-10"
    >
      <h1
        class="text-4xl md:text-6xl font-bold text-shadow-lg/80 text-shadow-4"
      >
        Регламент
      </h1>
      <p class="text-lg md:text-xl font-bold opacity-90">
        Edition 2 · 27-29 ноември 2026 · Международен конгресен център Бургас
      </p>
      <p class="text-xl md:text-2xl italic opacity-80">
        „Не просто поправяй – разобличавай, иронизирай и преобразявай."
      </p>
    </div>

    <!-- 1. Philosophy -->
    <section
      id="filosofiya"
      class="flex flex-col gap-4 bg-base-100/70 border-primary border-l-4 pl-6 py-4"
    >
      <h2 class="text-2xl md:text-3xl font-bold">01. Философия</h2>
      <p class="text-base md:text-lg leading-relaxed">
        LiberHack не е поредното място, където се прави „иновация". Тук имаш
        разрешение да бъдеш гневен, смешен и честен.
      </p>
      <p class="text-base md:text-lg leading-relaxed">
        Вместо учтиво да предлагаме „оптимизации", ние ще осветим това, което е
        фундаментално счупено - ще иронизираме нефункционалното и ще превърнем
        прозрачността в оръжие. Работим с реални данни, реални сайтове и реални
        процеси от България. Не с хипотетични проблеми, не с красиви слайдове
        без съдържание.
      </p>
    </section>

    <!-- 2. Participants -->
    <section
      id="uchastnitsi"
      class="flex flex-col gap-4 bg-base-100/70 border-primary border-l-4 pl-6 py-4"
    >
      <h2 class="text-2xl md:text-3xl font-bold">02. Участници</h2>
      <p class="text-base md:text-lg leading-relaxed">
        LiberHack е за младежи от <strong>14 до 21 години</strong>, подредени в
        отбори от <strong>2 до 6 души</strong>.
      </p>
      <p class="text-base md:text-lg leading-relaxed">
        Не търсим само програмисти. Идеалният отбор е смесица - някой, който
        пише код, някой, който мисли за потребителите, някой, който знае как да
        разкаже история с данни, и някой, който просто е достатъчно ядосан да
        види проблема докрай. Смесеният отбор е най-силният.
      </p>
      <p class="text-sm opacity-70">
        Учители и родители са добре дошли като наблюдатели - присъстват,
        подкрепят, но не се намесват в работата на отборите.
      </p>
    </section>

    <!-- 3. Theme -->
    <section
      id="tema"
      class="flex flex-col gap-4 bg-base-100/70 border-primary border-l-4 pl-6 py-4"
    >
      <h2 class="text-2xl md:text-3xl font-bold">03. Основна тема</h2>
      <p class="text-xl font-bold">
        Технологии в полза на хората - но го направете пънк.
      </p>
      <p class="text-base md:text-lg leading-relaxed">
        „Технологии в полза на хората" е постоянната тема на LiberHack - за това
        и за всяко следващо издание. Вярваме, че всеки може да промени нещо и че
        има твърде много неща, които могат да станат по-добри.
      </p>
      <p class="text-base md:text-lg leading-relaxed">
        Технологиите за „социално добро" обикновено изглеждат като скучни PDF
        доклади, безкрайни грантови форми и приложения с мили лога и мисия в три
        точки. Добрите намерения не са достатъчни.
      </p>
      <p class="text-base md:text-lg leading-relaxed">
        LiberHack е хакатон за граждански технологии - но без дипломатичността,
        без корпоративния лоск и без страха да наречем нещата с истинските им
        имена. Тук строим инструменти, които ядосват, мобилизират и карат хората
        да действат.
      </p>
      <p class="text-base md:text-lg font-semibold italic">
        Пънкът не е естетика. Пънкът е отказът да приемеш, че счупеното е
        нормално.
      </p>
    </section>

    <!-- 4. Projects & partner tracks -->
    <section
      id="napravleniya"
      class="flex flex-col gap-4 bg-base-100/70 border-primary border-l-4 pl-6 py-4"
    >
      <h2 class="text-2xl md:text-3xl font-bold">04. Проекти и направления</h2>
      <p class="text-base md:text-lg leading-relaxed">
        Няма фиксирани задачи. Всеки отбор работи по
        <strong>собствена идея</strong> в духа на LiberHack: реален продукт,
        реален проблем, реална България. Никакви безсъдържателни слайдове,
        никакви хиляди пъти дъвкани концепции. Ако идеята ви е достатъчно
        гневна, честна и работеща, сте на правилното място.
      </p>
      <div class="flex flex-col gap-3 border-l-2 border-primary pl-4 mt-2">
        <h3 class="text-xl font-bold">Партньорски направления</h3>
        <p class="text-base md:text-lg leading-relaxed opacity-80">
          Партньорите на LiberHack могат да обявят собствено брандирано
          направление - конкретно предизвикателство към участниците, за което
          партньорът осигурява ментор и получава място в журито за тази
          категория. Направленията се обявяват преди събитието.
        </p>
        <p class="text-base md:text-lg leading-relaxed">
          Участието в тях е <strong>по избор</strong>: отборът може да се насочи
          към партньорско направление или да работи по свободна идея в рамките
          на темата.
        </p>
      </div>
      <p class="text-sm opacity-70">
        Единственото условие и в двата случая: продуктът трябва да работи и да е
        насочен към нещо реално.
      </p>
    </section>

    <!-- 5. Rules -->
    <section
      id="pravila"
      class="flex flex-col gap-4 bg-base-100/70 border-primary border-l-4 pl-6 py-4"
    >
      <h2 class="text-2xl md:text-3xl font-bold">05. Правила за разработка</h2>
      <ul class="flex flex-col gap-4 text-base md:text-lg">
        <li class="flex flex-col gap-0.5">
          <span class="font-bold">Реални цели.</span>
          <span class="opacity-80"
            >Работата трябва да е насочена към реално съществуващи български
            казуси и институции. Без измислени примери.</span
          >
        </li>
        <li class="flex flex-col gap-0.5">
          <span class="font-bold">Пълна свобода на инструментите.</span>
          <span class="opacity-80"
            >Web scraping, OSINT, криптография, съвременни frontend фреймворци -
            всичко е позволено. Ако инструментът върши работа, използвайте
            го.</span
          >
        </li>
        <li class="flex flex-col gap-0.5">
          <span class="font-bold">Пънкът се основава на факти.</span>
          <span class="opacity-80"
            >Без дезинформация. Бунтът тук е срещу статуквото, не срещу
            истината. Всяка критика трябва да е подплатена с данни или конкретни
            лоши практики.</span
          >
        </li>
        <li class="flex flex-col gap-0.5">
          <span class="font-bold">Оригиналност.</span>
          <span class="opacity-80"
            >Всичко се създава по време на хакатона. Open-source библиотеки,
            публични API-та и съществуващи набори от данни са разрешени, но
            основното решение трябва да е направено на място.</span
          >
        </li>
        <li class="flex flex-col gap-0.5">
          <span class="font-bold text-error">Забранено е</span>
          <span class="opacity-80"
            >плагиатството и всякакви действия, нарушаващи закона - включително
            неоторизиран достъп до системи.</span
          >
        </li>
      </ul>
    </section>

    <!-- 6. Judging -->
    <section
      id="kriterii"
      class="flex flex-col gap-6 bg-base-100/70 border-primary border-l-4 pl-6 py-4"
    >
      <h2 class="text-2xl md:text-3xl font-bold">06. Критерии за оценяване</h2>
      <p class="text-base md:text-lg leading-relaxed">
        Оценява се това, което реално работи - не слайдове.
      </p>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div class="border-primary border-2 p-4 flex flex-col gap-2">
          <div class="flex flex-row justify-between items-center">
            <h3 class="font-bold text-lg">
              Техническо майсторство & Сигурност
            </h3>
            <span class="badge badge-primary">30%</span>
          </div>
          <p class="text-sm opacity-80">
            Работи ли изобщо? Реални данни, не примерни. Има ли работещо демо?
            Помислено ли е за сигурността и издържа ли кодът нещо повече от
            презентацията?
          </p>
        </div>
        <div class="border-primary border-2 p-4 flex flex-col gap-2">
          <div class="flex flex-row justify-between items-center">
            <h3 class="font-bold text-lg">Радикално критично мислене</h3>
            <span class="badge badge-primary">30%</span>
          </div>
          <p class="text-sm opacity-80">
            Захапан ли е истинският проблем или само симптомът? Има ли потенциал
            да предизвика реална реакция от граждани, журналисти, институции?
          </p>
        </div>
        <div class="border-primary border-2 p-4 flex flex-col gap-2">
          <div class="flex flex-row justify-between items-center">
            <h3 class="font-bold text-lg">Системен дизайн & UX революция</h3>
            <span class="badge badge-secondary">20%</span>
          </div>
          <p class="text-sm opacity-80">
            Решава ли реална болка на истински потребител? Може ли обикновен
            гражданин, не технически специалист, да го използва?
          </p>
        </div>
        <div class="border-primary border-2 p-4 flex flex-col gap-2">
          <div class="flex flex-row justify-between items-center">
            <h3 class="font-bold text-lg">Презентация & „Roast"</h3>
            <span class="badge badge-secondary">20%</span>
          </div>
          <p class="text-sm opacity-80">
            Колко остро, забавно и аргументирано е представен проблемът?
            Умението да се говори с факти и да се провокира едновременно.
          </p>
        </div>
      </div>
    </section>

    <!-- 7. Venue & schedule -->
    <section
      id="programa"
      class="flex flex-col gap-4 bg-base-100/70 border-primary border-l-4 pl-6 py-4"
    >
      <h2 class="text-2xl md:text-3xl font-bold">
        07. Място, програма и времева рамка
      </h2>
      <p class="text-base md:text-lg leading-relaxed">
        LiberHack · Edition 2 се провежда на живо на
        <strong>27, 28 и 29 ноември 2026 г.</strong> (петък - неделя, ~48 часа)
        в <strong>Международния конгресен център Бургас</strong>, с подкрепата
        на <strong>Община Бургас</strong>. Всички отбори, щандове и сцена са в
        едно общо пространство.
      </p>
      <div class="overflow-x-auto">
        <table
          class="table table-zebra w-full border-primary border-2 text-sm md:text-base"
        >
          <thead>
            <tr class="border-primary border-b-2">
              <th>Ден</th>
              <th>Рамка на програмата</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td class="font-semibold whitespace-nowrap">Петък, 27 ноември</td>
              <td>
                Регистрация, официално откриване, представяне на партньорските
                направления, кратки практически сесии от партньорите (по
                желание), старт на разработката
              </td>
            </tr>
            <tr>
              <td class="font-semibold whitespace-nowrap">
                Събота, 28 ноември
              </td>
              <td>Активна разработка, менторски сесии</td>
            </tr>
            <tr>
              <td class="font-semibold whitespace-nowrap">
                Неделя, 29 ноември
              </td>
              <td>
                Финализиране на проектите, публични презентации пред журито,
                обявяване на победителите
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="text-sm opacity-60">
        Точният часови график ще бъде публикуван преди събитието.
      </p>
    </section>

    <!-- 8. Mentors -->
    <section
      id="mentori"
      class="flex flex-col gap-4 bg-base-100/70 border-primary border-l-4 pl-6 py-4"
    >
      <h2 class="text-2xl md:text-3xl font-bold">08. Ментори</h2>
      <p class="text-base md:text-lg leading-relaxed">
        По време на хакатона ще има достъпни ментори - разработчици, дизайнери,
        журналисти и граждански активисти.
      </p>
      <ul class="flex flex-col gap-2 text-base md:text-lg list-none">
        <li>
          → Менторите <strong>не пишат код</strong> вместо отборите - те
          насочват, не решават.
        </li>
        <li>→ Менторите <strong>не могат</strong> да са част от журито.</li>
        <li>→ Всеки отбор може да поиска менторска сесия по всяко време.</li>
        <li>→ Част от менторите са осигурени от партньорите на събитието.</li>
      </ul>
    </section>

    <!-- 9. Registration -->
    <section
      id="registratsiya"
      class="flex flex-col gap-4 bg-base-100/70 border-primary border-l-4 pl-6 py-4"
    >
      <h2 class="text-2xl md:text-3xl font-bold">09. Регистрация</h2>
      <ul class="flex flex-col gap-2 text-base md:text-lg">
        <li>
          → Регистрацията се извършва чрез <strong>онлайн форма</strong> на
          сайта.
        </li>
        <li>
          → При регистрацията се посочват имена, възраст, училище/университет,
          умения и ниво на опит.
        </li>
        <li>
          → Отборите могат да се регистрират заедно или поотделно.
          <strong>Индивидуално регистрираните се разпределят в отбори</strong>
          предварително, преди събитието, за да пристигнат на място с готов
          екип.
        </li>
        <li>
          → Регистрацията е <strong>задължителна</strong> за всички участници,
          включително наблюдатели.
        </li>
        <li>
          → Регистрацията за Edition 2 е отворена от
          <strong>19 септември до 20 ноември 2026 г.</strong>
        </li>
      </ul>
    </section>

    <!-- 10. Awards -->
    <section
      id="nagradi"
      class="flex flex-col gap-4 bg-base-100/70 border-primary border-l-4 pl-6 py-4"
    >
      <h2 class="text-2xl md:text-3xl font-bold">10. Награди</h2>
      <div class="flex flex-col gap-4">
        <div>
          <h3 class="font-bold text-lg mb-2">Общо класиране</h3>
          <p class="text-base opacity-80 mb-2">
            Журито избира трите най-силни проекта измежду всички участници,
            независимо от направлението.
          </p>
          <div class="flex flex-col gap-2">
            <div
              class="flex flex-row gap-3 items-center border-primary border-2 p-3"
            >
              <span class="text-2xl font-bold">🥇</span>
              <span>1-во място - TBA</span>
            </div>
            <div
              class="flex flex-row gap-3 items-center border-primary border-2 p-3"
            >
              <span class="text-2xl font-bold">🥈</span>
              <span>2-ро място - TBA</span>
            </div>
            <div
              class="flex flex-row gap-3 items-center border-primary border-2 p-3"
            >
              <span class="text-2xl font-bold">🥉</span>
              <span>3-то място - TBA</span>
            </div>
          </div>
        </div>
        <div>
          <h3 class="font-bold text-lg mb-2">
            Награди по партньорски направления
          </h3>
          <p class="text-base opacity-80">
            Победителят във всяко обявено партньорско направление получава
            отделна награда, дори ако не е в общото класиране.
          </p>
        </div>
        <div class="bg-primary/10 border-primary border-2 p-3">
          <p class="font-semibold">
            Всички участници получават сертификат за участие в LiberHack.
          </p>
        </div>
        <p class="text-sm opacity-60">
          Подробности за наградния фонд ще бъдат обявени преди събитието.
        </p>
      </div>
    </section>

    <!-- 11. Jury -->
    <section
      id="zhuri"
      class="flex flex-col gap-4 bg-base-100/70 border-primary border-l-4 pl-6 py-4"
    >
      <h2 class="text-2xl md:text-3xl font-bold">11. Жури</h2>
      <p class="text-base md:text-lg leading-relaxed">
        Проектите се оценяват от <strong>независимо жури</strong> от специалисти
        в областите технологии, дизайн, журналистика и гражданско общество.
        Партньор, обявил собствено направление, получава място в журито за тази
        категория.
      </p>
      <ul class="flex flex-col gap-2 text-base md:text-lg">
        <li>
          → Всеки отбор има <strong>до 10 минути</strong> за презентация +
          <strong>5 минути</strong> за въпроси.
        </li>
        <li>→ Журито оценява по критериите в Раздел 06.</li>
        <li>→ Решенията на журито са <strong>окончателни</strong>.</li>
        <li>
          → Членовете на журито ще бъдат публично обявени преди събитието.
        </li>
      </ul>
    </section>

    <!-- 12. IP -->
    <section
      id="ip"
      class="flex flex-col gap-4 bg-base-100/70 border-primary border-l-4 pl-6 py-4"
    >
      <h2 class="text-2xl md:text-3xl font-bold">
        12. Интелектуална собственост
      </h2>
      <p class="text-base md:text-lg leading-relaxed">
        Всичко, което създадете, си остава <strong>ваше</strong>. Задължаваме
        Open Source лицензи, защото бунтът е по-силен, когато може да бъде
        продължен от следващия.
      </p>
      <p class="text-lg italic font-semibold">
        „Системата разчита на твоето мълчание. Бъди шумен."
      </p>
    </section>

    <!-- 13. General -->
    <section
      id="obshti-razporedbi"
      class="flex flex-col gap-4 bg-base-100/70 border-primary border-l-4 pl-6 py-4"
    >
      <h2 class="text-2xl md:text-3xl font-bold">13. Общи разпоредби</h2>
      <ul class="flex flex-col gap-2 text-base md:text-lg">
        <li>
          → Участието в LiberHack означава пълно съгласие с настоящия регламент.
        </li>
        <li>
          → Организаторите си запазват правото да изменят регламента при
          необходимост.
        </li>
        <li>
          → Организаторите не носят отговорност за лични вещи или инциденти по
          време на събитието.
        </li>
        <li>
          → Проектите се събират в публичен архив; по време на събитието се
          правят снимки и видео, които могат да бъдат публикувани от
          организаторите и партньорите.
        </li>
        <li>
          → За въпроси:
          <a href="mailto:contact@liberhack.org" class="underline font-bold"
            >contact@liberhack.org</a
          >
        </li>
      </ul>
    </section>

    <p class="text-xs opacity-40 text-right">
      Последна актуализация: 10.09.2026 г.
    </p>
    <Footer />
  </div>
</template>
