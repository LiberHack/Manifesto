<template>
  <ul class="list bg-base-100 rounded-box shadow-md w-full">
    <li
      tabindex="0"
      class="collapse collapse-arrow bg-base-100 border-base-300 border"
    >
      <div class="collapse-title font-semibold">awards</div>
      <div class="collapse-content text-sm">
        <p>
          Наградният фонд за Edition 2 се обявява преди събитието
          (<strong>TBA</strong>). Структурата остава същата:
        </p>

        <ul class="list-[square] list-inside ml-2">
          <li>
            <strong>Общо класиране:</strong> журито избира трите най-силни
            проекта измежду всички отбори, независимо от направлението — 1-во,
            2-ро и 3-то място.
          </li>
          <li>
            <strong>Партньорски направления:</strong> победителят във всяко
            обявено партньорско направление получава отделна награда, дори ако
            не е в общото класиране.
          </li>
          <li>
            <strong>За всички участници:</strong> Всеки, включил се в конкурса,
            получава официален сертификат за участие.
          </li>
        </ul>
      </div>
    </li>
    <li
      tabindex="0"
      class="collapse collapse-arrow bg-base-100 border-base-300 border"
    >
      <div class="collapse-title font-semibold">team_size</div>
      <div class="collapse-content text-sm">
        <p>
          Отборите трябва да се състоят от минимум 2 и максимум 6 участници. Не
          търсим само програмисти — идеалният отбор е смесица от хора, които
          кодират, мислят за потребителите, разказват истории с данни и са
          достатъчно ядосани да видят проблема докрай.
        </p>
      </div>
    </li>
    <li
      tabindex="0"
      class="collapse collapse-arrow bg-base-100 border-base-300 border"
    >
      <div class="collapse-title font-semibold">age</div>
      <div class="collapse-content text-sm">
        <p>
          LiberHack е за младежи от 14 до 21 години. Учители и родители са добре
          дошли като наблюдатели — присъстват и подкрепят, но не се намесват в
          работата на отборите.
        </p>
      </div>
    </li>
    <li
      tabindex="0"
      class="collapse collapse-arrow bg-base-100 border-base-300 border"
    >
      <div class="collapse-title font-semibold">register_time</div>
      <div class="collapse-content text-sm">
        <p>
          Регистрацията за Edition 2 е отворена от 19 септември до 20 ноември
          2026 г. Задължителна е за всички — участници и наблюдатели.
        </p>
      </div>
    </li>
    <li
      tabindex="0"
      class="collapse collapse-arrow bg-base-100 border-base-300 border"
    >
      <div class="collapse-title font-semibold">is_alone</div>
      <div class="collapse-content text-sm">
        <p>
          Регистрирай се индивидуално и ние ще те разпределим в отбор
          предварително, преди събитието, за да дойдеш на място с готов екип.
          Отборите могат да се регистрират заедно или поотделно.
        </p>
      </div>
    </li>
    <li
      tabindex="0"
      class="collapse collapse-arrow bg-base-100 border-base-300 border"
    >
      <div class="collapse-title font-semibold">location</div>
      <div class="collapse-content text-sm">
        <p>
          Edition 2 се провежда в Международния конгресен център Бургас, с
          подкрепата на Община Бургас — всички отбори, щандове и сцена в едно
          общо пространство.
        </p>
      </div>
    </li>
    <li
      tabindex="0"
      class="collapse collapse-arrow bg-base-100 border-base-300 border"
    >
      <div class="collapse-title font-semibold">schedule</div>
      <div class="collapse-content text-sm">
        <p>
          LiberHack · Edition 2 е ~48 часа — от петък 27 ноември следобед до
          неделя 29 ноември на обяд. Стартът на разработката е петък вечер след
          официалното откриване, а финалните презентации и обявяването на
          победителите са в неделя следобед. Точният часови график ще бъде
          публикуван преди събитието.
        </p>
      </div>
    </li>
    <li
      tabindex="0"
      class="collapse collapse-arrow bg-base-100 border-base-300 border"
    >
      <div class="collapse-title font-semibold">work_in_advance</div>
      <div class="collapse-content text-sm">
        <p>
          Не, работата по проектите в аванс не е позволена. Целият код трябва да
          бъде създаден по време на самото събитие. Open-source библиотеки,
          публични API-та и съществуващи набори от данни са разрешени.
        </p>
      </div>
    </li>
    <li
      tabindex="0"
      class="collapse collapse-arrow bg-base-100 border-base-300 border"
    >
      <div class="collapse-title font-semibold">tech_stack</div>
      <div class="collapse-content text-sm">
        <p>
          Няма ограничения. Web scraping, OSINT, криптография, съвременни
          frontend фреймворци — всичко е позволено. Ако инструментът върши
          работа, използвайте го.
        </p>
      </div>
    </li>
    <li
      tabindex="0"
      class="collapse collapse-arrow bg-base-100 border-base-300 border"
    >
      <div class="collapse-title font-semibold">judging</div>
      <div class="collapse-content text-sm">
        <p>
          Оценяват се 4 критерия: Техническо майсторство и Сигурност (30%),
          Радикално критично мислене (30%), Системен дизайн & UX (20%),
          Презентация & „Roast" (20%). Всеки отбор има до 10 минути за
          презентация + 5 минути за въпроси от журито.
        </p>
      </div>
    </li>
    <li
      tabindex="0"
      class="collapse collapse-arrow bg-base-100 border-base-300 border"
    >
      <div class="collapse-title font-semibold">ip_ownership</div>
      <div class="collapse-content text-sm">
        <p>
          Всичко, което създадете, си остава ваше. Изискваме Open Source лицензи
          — бунтът е по-силен, когато може да бъде продължен от следващия.
        </p>
      </div>
    </li>
    <li
      tabindex="0"
      class="collapse collapse-arrow bg-base-100 border-base-300 border"
    >
      <div class="collapse-title font-semibold">food</div>
      <div class="collapse-content text-sm">
        <p>
          Осигуряваме обяд в събота, а през цялото време ще имате достъп до
          кафе, чай и вода.
        </p>
      </div>
    </li>
    <li
      tabindex="0"
      class="collapse collapse-arrow bg-base-100 border-base-300 border"
    >
      <div class="collapse-title font-semibold">from_home</div>
      <div class="collapse-content text-sm">
        <p>Работата от вкъщи не е препоръчителна.</p>
      </div>
    </li>
    <li
      tabindex="0"
      class="collapse collapse-arrow bg-base-100 border-base-300 border"
    >
      <div class="collapse-title font-semibold">mentors</div>
      <div class="collapse-content text-sm">
        <p>
          На ваше разположение ще бъдат ментори с разнообразен профил:
          разработчици, дизайнери, журналисти и граждански активисти. Те
          насочват, не решават — и не могат да бъдат членове на журито.
        </p>
      </div>
    </li>
    <li
      tabindex="0"
      class="collapse collapse-arrow bg-base-100 border-base-300 border"
    >
      <div class="collapse-title font-semibold">more_questions</div>
      <div class="collapse-content text-sm">
        <p>
          Виж пълния регламент на
          <NuxtLink to="/reglament" class="underline font-bold"
            >liberhack.org/reglament</NuxtLink
          >. Ако не намираш отговора, пиши ни на
          <a href="mailto:contact@liberhack.org" class="underline"
            >contact@liberhack.org</a
          >
          или намери ни в Discord и Instagram.
        </p>
      </div>
    </li>
  </ul>
</template>
