// src/scripts/site-header.js

(function () {
  const cb = document.getElementById("nav-open");
  const header = document.querySelector(".site-header");
  const label = document.querySelector(".hamburger");
  const closeLabel = document.querySelector(".close-menu");
  const navLinks = Array.from(
    document.querySelectorAll(".nav-links .link, .mobile-nav .m-link")
  );

  const sectionIds = ["aboutus", "products", "testimonials", "faq", "contact"];

  // Country / state / city selector elements
  const countryTrigger = document.querySelector(".country-trigger");
  const countryDropdown = document.querySelector(".country-dropdown");
  const countryList = document.querySelector(".country-list");
  const countrySearch = document.querySelector(".country-search");
  const flagPlaceholder = document.querySelector(".flag-placeholder");
  const countryCode = document.querySelector(".country-code");
  const selectedCountryNameEl = document.querySelector(
    ".selected-country-name"
  );
  const stateListEl = document.querySelector(".state-list");
  const cityListEl = document.querySelector(".city-list");
  const selectedStateNameEl = document.querySelector(".selected-state-name");

  // Global location search elements
  const locationSearchInput = document.querySelector(".location-search-input");
  const locationSearchResults = document.querySelector(
    ".location-search-results"
  );

  // Data
  let countries = [];
  let statesByCountry = {}; // { "IN": [ {name, slug, code, countryCode}, ... ] }
  let citiesByStateKey = {}; // { "IN-GJ": [ {name, slug}, ... ] }

  // Search index: city / state / country
  let searchIndex = [];
  let hasCountries = false;
  let hasStates = false;
  let hasCities = false;

  // default India active
  let userCountry = "IN";

  // URL-derived slugs for highlighting
  let urlProductSlug = null;
  let urlCountrySlug = null;
  let urlStateSlug = null;
  let urlCitySlug = null;

  // current selection for city column
  let currentStateKey = null; // "IN-GJ"
  let currentStateName = "";
  let currentCountrySlug = null;
  let currentStateSlug = null;

  // track if geo selection changed; reload page on close only if true
  let hasGeoChanged = false;

  /* ================= Helpers for slugs & URLs ================= */

  function slugifyClient(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/['’]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  // parse current path: /:productSlug/in/:countrySlug/:stateSlug?/:citySlug?
  function parseGeoFromPath() {
    const path = window.location.pathname.replace(/\/+$/, "");
    const parts = path.split("/").filter(Boolean);
    const inIdx = parts.indexOf("in");
    if (inIdx === -1) {
      return {
        productSlug: parts[0] || null,
        countrySlug: null,
        stateSlug: null,
        citySlug: null,
      };
    }
    const productSlug = parts[0] || null;
    const countrySlug = parts[inIdx + 1] || null;
    const stateSlug = parts[inIdx + 2] || null;
    const citySlug = parts[inIdx + 3] || null;
    return { productSlug, countrySlug, stateSlug, citySlug };
  }

  // initialize URL slugs
  (function initUrlSlugs() {
    const parsed = parseGeoFromPath();
    if (parsed) {
      urlProductSlug = parsed.productSlug;
      urlCountrySlug = parsed.countrySlug ? parsed.countrySlug.toLowerCase() : null;
      urlStateSlug = parsed.stateSlug ? parsed.stateSlug.toLowerCase() : null;
      urlCitySlug = parsed.citySlug ? parsed.citySlug.toLowerCase() : null;
      currentCountrySlug = urlCountrySlug;
      currentStateSlug = urlStateSlug;
    }
  })();

  // which product slug to use when we navigate
  function getProductSlug() {
    const meta = document.querySelector('meta[name="x-product-slug"]');
    if (meta && meta.content) {
      const v = meta.content.trim();
      if (v) return v;
    }
    if (urlProductSlug) return urlProductSlug;
    const parts = window.location.pathname.split("/").filter(Boolean);
    return parts[0] || "";
  }

  // Build a flag image URL
  function getFlagUrl(code) {
    const c = (code || "").toLowerCase();
    if (!c || c.length !== 2) return "";
    return `https://flagcdn.com/w20/${c}.png`;
  }

  // change URL but DON'T reload page immediately
  function navigateToGeoPage(countrySlug, stateSlug, citySlug) {
    const productSlug = getProductSlug();
    if (!productSlug || !countrySlug) return;

    let path = `/${productSlug}/in/${countrySlug.toLowerCase()}`;
    if (stateSlug) path += `/${stateSlug.toLowerCase()}`;
    if (citySlug) path += `/${citySlug.toLowerCase()}`;

    history.replaceState(null, "", path);

    urlProductSlug = productSlug.toLowerCase();
    urlCountrySlug = countrySlug.toLowerCase();
    urlStateSlug = stateSlug ? stateSlug.toLowerCase() : null;
    urlCitySlug = citySlug ? citySlug.toLowerCase() : null;
    currentCountrySlug = urlCountrySlug;
    currentStateSlug = urlStateSlug;

    hasGeoChanged = true;
  }

  /* ================= Search index ================= */

  function maybeBuildSearchIndex() {
    if (!hasCountries || !hasStates || !hasCities) return;
    buildSearchIndex();
    // If user already typed something, refresh results
    if (locationSearchInput && locationSearchInput.value.trim()) {
      updateGlobalSearchResults();
    }
  }

  function buildSearchIndex() {
    searchIndex = [];
    const stateMapByKey = {};

    // Countries
    countries.forEach((c) => {
      if (!c.code || !c.name) return;
      const cCode = String(c.code).toUpperCase();
      const cName = c.name;
      const cSlug = slugifyClient(c.slug || c.name || cCode);

      searchIndex.push({
        type: "country",
        countryCode: cCode,
        countryName: cName,
        countrySlug: cSlug,
        stateCode: null,
        stateName: null,
        stateSlug: null,
        cityName: null,
        citySlug: null,
      });
    });

    // States
    Object.keys(statesByCountry || {}).forEach((rawCode) => {
      const cCode = rawCode.toUpperCase();
      const countryObj = countries.find(
        (c) => (c.code || "").toUpperCase() === cCode
      );
      const countryName = countryObj?.name || cCode;
      const countrySlug = slugifyClient(
        countryObj?.slug || countryObj?.name || cCode
      );

      const states = statesByCountry[rawCode] || [];
      states.forEach((st) => {
        const stateCode = (st.code || "").toUpperCase();
        const stateName = st.name;
        const stateSlug = st.slug;

        if (stateCode) {
          const key = `${cCode}-${stateCode}`;
          stateMapByKey[key] = {
            countryCode: cCode,
            countryName,
            countrySlug,
            stateCode,
            stateName,
            stateSlug,
          };
        }

        searchIndex.push({
          type: "state",
          countryCode: cCode,
          countryName,
          countrySlug,
          stateCode,
          stateName,
          stateSlug,
          cityName: null,
          citySlug: null,
        });
      });
    });

    // Cities
    Object.keys(citiesByStateKey || {}).forEach((key) => {
      const stateInfo = stateMapByKey[key];
      if (!stateInfo) return;

      const {
        countryCode,
        countryName,
        countrySlug,
        stateCode,
        stateName,
        stateSlug,
      } = stateInfo;

      const cities = citiesByStateKey[key] || [];
      cities.forEach((ct) => {
        searchIndex.push({
          type: "city",
          countryCode,
          countryName,
          countrySlug,
          stateCode,
          stateName,
          stateSlug,
          cityName: ct.name,
          citySlug: ct.slug,
        });
      });
    });

    const typeOrder = { city: 0, state: 1, country: 2 };
    searchIndex.sort((a, b) => {
      const ta = typeOrder[a.type] ?? 3;
      const tb = typeOrder[b.type] ?? 3;
      if (ta !== tb) return ta - tb;
      const la =
        (a.cityName || a.stateName || a.countryName || "").toLowerCase();
      const lb =
        (b.cityName || b.stateName || b.countryName || "").toLowerCase();
      return la.localeCompare(lb);
    });
  }

  function clearGlobalSearchResults() {
    if (!locationSearchResults) return;
    locationSearchResults.innerHTML = "";
    locationSearchResults.classList.remove("is-open");
  }

  function applySearchSelection(item) {
    if (!item) return;
    const {
      countryCode: cCode,
      countrySlug,
      stateCode,
      stateSlug,
      stateName,
      citySlug,
    } = item;

    if (!cCode || !countrySlug) return;

    userCountry = cCode.toUpperCase();
    currentCountrySlug = countrySlug;
    urlCountrySlug = countrySlug.toLowerCase();

    // Update left column (countries)
    updateCountryDisplay();

    // Prepare state
    let key = null;
    if (stateCode) {
      const sCode = stateCode.toUpperCase();
      key = `${userCountry}-${sCode}`;
      currentStateKey = key;
      currentStateName = stateName || "";
      currentStateSlug = stateSlug || null;
      urlStateSlug = stateSlug ? stateSlug.toLowerCase() : null;
    } else {
      currentStateKey = null;
      currentStateName = "";
      currentStateSlug = null;
      urlStateSlug = null;
    }

    // Render state & city lists again
    renderCityList();

    // Highlight state button
    if (stateSlug && stateListEl) {
      stateListEl
        .querySelectorAll(".state-item")
        .forEach((el) => el.classList.remove("selected"));
      const stateBtn = stateListEl.querySelector(
        `.state-item[data-state-slug="${stateSlug}"]`
      );
      if (stateBtn) {
        stateBtn.classList.add("selected");
      }
    }

    // Highlight city
    if (citySlug && cityListEl && key) {
      cityListEl
        .querySelectorAll(".city-item")
        .forEach((el) => el.classList.remove("selected"));
      const cityBtn = cityListEl.querySelector(
        `.city-item[data-city-slug="${citySlug}"]`
      );
      if (cityBtn) {
        cityBtn.classList.add("selected");
        urlCitySlug = citySlug.toLowerCase();
      }
    } else {
      urlCitySlug = null;
    }

    navigateToGeoPage(countrySlug, stateSlug || null, citySlug || null);

    // Ensure dropdown is visible
    if (countryDropdown && !countryDropdown.classList.contains("open")) {
      toggleCountryDropdown();
    }
  }

  function updateGlobalSearchResults() {
    if (!locationSearchInput || !locationSearchResults) return;

    const term = locationSearchInput.value.trim().toLowerCase();
    locationSearchResults.innerHTML = "";

    if (!term) {
      locationSearchResults.classList.remove("is-open");
      return;
    }

    const matches = searchIndex.filter((item) => {
      return (
        (item.cityName && item.cityName.toLowerCase().includes(term)) ||
        (item.stateName && item.stateName.toLowerCase().includes(term)) ||
        (item.countryName && item.countryName.toLowerCase().includes(term))
      );
    });

    if (!matches.length) {
      const empty = document.createElement("div");
      empty.className = "location-search-empty";
      empty.textContent = "No matching locations.";
      locationSearchResults.appendChild(empty);
      locationSearchResults.classList.add("is-open");
      return;
    }

    matches.slice(0, 10).forEach((item) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "location-search-item";

      let label = "";
      if (item.cityName) {
        label = `${item.cityName}, ${item.stateName}, ${item.countryName}`;
      } else if (item.stateName) {
        label = `${item.stateName}, ${item.countryName}`;
      } else {
        label = item.countryName;
      }

      btn.textContent = label;

      btn.addEventListener("click", () => {
        locationSearchInput.value = label;
        clearGlobalSearchResults();
        applySearchSelection(item);
      });

      locationSearchResults.appendChild(btn);
    });

    locationSearchResults.classList.add("is-open");
  }

  /* ================= Fetching ================= */

  async function fetchCountries() {
    try {
      const response = await fetch(
        "https://test.amrita-fashions.com/api/countries"
      );
      if (!response.ok) throw new Error("Failed to fetch countries");
      const json = await response.json();
      countries = Array.isArray(json)
        ? json
        : json?.data?.countries || json?.data || [];
      populateCountryList();
      hydrateCountryFromUrlOrDetect();
    } catch (err) {
      console.error("Error fetching countries:", err);
      countries = [
        { code: "IN", name: "India", slug: "india" },
        { code: "US", name: "United States" },
        { code: "GB", name: "United Kingdom" },
        { code: "CA", name: "Canada" },
        { code: "AU", name: "Australia" },
      ];
      populateCountryList();
      hydrateCountryFromUrlOrDetect();
    } finally {
      hasCountries = true;
      maybeBuildSearchIndex();
    }
  }

  async function fetchStates() {
    try {
      const response = await fetch("https://test.amrita-fashions.com/api/states");
      if (!response.ok) throw new Error("Failed to fetch states");
      const json = await response.json();

      let raw = [];
      if (Array.isArray(json)) raw = json;
      else if (Array.isArray(json?.data?.states)) raw = json.data.states;
      else if (Array.isArray(json?.data)) raw = json.data;
      else if (Array.isArray(json.states)) raw = json.states;

      statesByCountry = {};

      raw.forEach((st) => {
        const name =
          st.name || st.stateName || st.state || st.title || st.label;
        if (!name) return;

        let countryCode =
          (st.country &&
            (st.country.code ||
              st.country.code2 ||
              st.country.iso2 ||
              st.country.isoCode ||
              st.country.slug)) ||
          st.countryCode ||
          st.country_code ||
          st.country ||
          "";

        if (typeof countryCode === "object" && countryCode) {
          countryCode =
            countryCode.code ||
            countryCode.code2 ||
            countryCode.iso2 ||
            countryCode.isoCode ||
            countryCode.slug ||
            "";
        }

        countryCode = (countryCode || "").toUpperCase();
        if (!countryCode || countryCode.length !== 2) return;

        let stateCode = st.code || st.stateCode || st.abbreviation || "";
        stateCode = (stateCode || "").toUpperCase();

        const slug =
          st.slug ||
          st.stateSlug ||
          String(name)
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/(^-|-$)/g, "");

        if (!statesByCountry[countryCode]) statesByCountry[countryCode] = [];
        statesByCountry[countryCode].push({
          name,
          slug,
          code: stateCode,
          countryCode,
        });
      });

      renderStateList();
    } catch (err) {
      console.error("Error fetching states:", err);
    } finally {
      hasStates = true;
      maybeBuildSearchIndex();
    }
  }

  async function fetchCities() {
    try {
      const response = await fetch("https://test.amrita-fashions.com/api/cities");
      if (!response.ok) throw new Error("Failed to fetch cities");
      const json = await response.json();

      let raw = [];
      if (Array.isArray(json)) raw = json;
      else if (Array.isArray(json?.data?.cities)) raw = json.data.cities;
      else if (Array.isArray(json?.data)) raw = json.data;
      else if (Array.isArray(json.cities)) raw = json.cities;

      citiesByStateKey = {};

      raw.forEach((ct) => {
        const name =
          ct.name || ct.cityName || ct.city || ct.title || ct.label;
        if (!name) return;

        let countryCode =
          (ct.country &&
            (ct.country.code ||
              ct.country.code2 ||
              ct.country.iso2 ||
              ct.country.isoCode ||
              ct.country.slug)) ||
          ct.countryCode ||
          ct.country_code ||
          "";

        if (typeof countryCode === "object" && countryCode) {
          countryCode =
            countryCode.code ||
            countryCode.code2 ||
            countryCode.iso2 ||
            countryCode.isoCode ||
            countryCode.slug ||
            "";
        }

        let stateCode =
          (ct.state &&
            (ct.state.code ||
              ct.state.code2 ||
              ct.state.iso2 ||
              ct.state.isoCode ||
              ct.state.slug)) ||
          ct.stateCode ||
          ct.state_code ||
          "";

        if (typeof stateCode === "object" && stateCode) {
          stateCode =
            stateCode.code ||
            stateCode.code2 ||
            stateCode.iso2 ||
            stateCode.isoCode ||
            stateCode.slug ||
            "";
        }

        countryCode = (countryCode || "").toUpperCase();
        stateCode = (stateCode || "").toUpperCase();
        if (!countryCode || !stateCode) return;

        const key = `${countryCode}-${stateCode}`;
        const slug =
          ct.slug ||
          slugifyClient(name || "") ||
          `${countryCode.toLowerCase()}-${stateCode.toLowerCase()}`;

        if (!citiesByStateKey[key]) citiesByStateKey[key] = [];
        citiesByStateKey[key].push({ name, slug });
      });

      renderCityList();
    } catch (err) {
      console.error("Error fetching cities:", err);
    } finally {
      hasCities = true;
      maybeBuildSearchIndex();
    }
  }

  /* ================= Rendering ================= */

  function populateCountryList() {
    if (!countryList) return;
    countryList.innerHTML = "";

    const sorted = [...countries].sort((a, b) =>
      String(a.name || "").localeCompare(String(b.name || ""))
    );

    sorted.forEach((country) => {
      if (!country.code || !country.name) return;
      const code = String(country.code).toUpperCase();
      const slug = slugifyClient(country.slug || country.name);
      const url = getFlagUrl(code);

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "country-item";
      btn.setAttribute("data-code", code);
      btn.setAttribute("data-slug", slug);
      btn.innerHTML = `
        <span class="country-flag">
          ${
            url
              ? `<img src="${url}" alt="${country.name} flag" class="flag-img" loading="lazy" width="20" height="15" />`
              : "🌐"
          }
        </span>
        <span class="country-name">${country.name}</span>
      `;

      btn.addEventListener("click", () => {
        selectCountry(code, slug);
      });

      countryList.appendChild(btn);
    });

    updateCountryDisplay();
  }

  function renderStateList() {
    if (!stateListEl || !selectedCountryNameEl) return;
    const code = (userCountry || "IN").toUpperCase();

    const countryObj = countries.find(
      (c) => (c.code || "").toUpperCase() === code
    );
    const countryName = countryObj?.name || code;
    const countrySlug = slugifyClient(
      countryObj?.slug || countryObj?.name || code
    );

    selectedCountryNameEl.textContent = countryName;
    stateListEl.innerHTML = "";

    const states = (statesByCountry[code] || [])
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name));

    if (!states.length) {
      const empty = document.createElement("div");
      empty.className = "state-empty";
      empty.textContent = "No states found for this country.";
      stateListEl.appendChild(empty);
      currentStateKey = null;
      currentStateName = "";
      renderCityList();
      return;
    }

    let fromUrlKey = null;
    let fromUrlStateName = "";

    states.forEach((st) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "state-item";
      btn.textContent = st.name;
      btn.setAttribute("data-state-slug", st.slug);
      btn.setAttribute("data-country-slug", countrySlug);
      btn.setAttribute("data-state-code", st.code || "");
      btn.setAttribute("data-country-code", st.countryCode || code);

      if (urlStateSlug && st.slug.toLowerCase() === urlStateSlug) {
        btn.classList.add("selected");
        const cCode = (st.countryCode || code || "").toUpperCase();
        const sCode = (st.code || "").toUpperCase();
        if (cCode && sCode) {
          fromUrlKey = `${cCode}-${sCode}`;
          fromUrlStateName = st.name;
        }
      }

      btn.addEventListener("click", () => {
        const cSlug =
          btn.getAttribute("data-country-slug") || countrySlug || "";
        const sSlug = btn.getAttribute("data-state-slug") || st.slug || "";
        const cCode =
          (btn.getAttribute("data-country-code") || code || "").toUpperCase();
        const sCode =
          (btn.getAttribute("data-state-code") || st.code || "").toUpperCase();

        if (!cSlug || !sSlug) return;

        stateListEl
          .querySelectorAll(".state-item")
          .forEach((el) => el.classList.remove("selected"));
        btn.classList.add("selected");

        currentStateKey = cCode && sCode ? `${cCode}-${sCode}` : null;
        currentStateName = st.name;
        currentCountrySlug = cSlug;
        currentStateSlug = sSlug;

        renderCityList();

        navigateToGeoPage(cSlug, sSlug);
      });

      stateListEl.appendChild(btn);
    });

    if (fromUrlKey) {
      currentStateKey = fromUrlKey;
      currentStateName = fromUrlStateName;
    }

    renderCityList();
  }

  function renderCityList() {
    if (!cityListEl || !selectedStateNameEl) return;

    selectedStateNameEl.textContent =
      currentStateName && currentStateKey ? currentStateName : "—";

    cityListEl.innerHTML = "";

    if (!currentStateKey) {
      const empty = document.createElement("div");
      empty.className = "city-empty";
      empty.textContent = "Select a state to see cities.";
      cityListEl.appendChild(empty);
      return;
    }

    const cities = (citiesByStateKey[currentStateKey] || [])
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name));

    if (!cities.length) {
      const empty = document.createElement("div");
      empty.className = "city-empty";
      empty.textContent = "No cities found for this state.";
      cityListEl.appendChild(empty);
      return;
    }

    cities.forEach((ct) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "city-item";
      btn.textContent = ct.name;
      btn.setAttribute("data-city-slug", ct.slug || "");

      if (urlCitySlug && ct.slug && ct.slug.toLowerCase() === urlCitySlug) {
        btn.classList.add("selected");
      }

      btn.addEventListener("click", () => {
        const citySlug = btn.getAttribute("data-city-slug") || ct.slug || "";
        if (!citySlug) return;

        cityListEl
          .querySelectorAll(".city-item")
          .forEach((el) => el.classList.remove("selected"));
        btn.classList.add("selected");

        const cSlug = currentCountrySlug || urlCountrySlug || "";
        const sSlug = currentStateSlug || urlStateSlug || "";
        if (!cSlug) return;

        navigateToGeoPage(cSlug, sSlug, citySlug);
      });

      cityListEl.appendChild(btn);
    });
  }

  /* ================= Country selection / display ================= */

  function updateCountryDisplay() {
    const code = (userCountry || "IN").toUpperCase();
    const flagUrl = getFlagUrl(code);

    if (flagPlaceholder) {
      if (flagUrl) {
        flagPlaceholder.innerHTML = `<img src="${flagUrl}" alt="${code} flag" class="flag-img" loading="lazy" width="20" height="15" />`;
      } else {
        flagPlaceholder.textContent = "🌐";
      }
    }

    if (countryCode) {
      countryCode.textContent = code;
    }

    document.querySelectorAll(".country-item").forEach((item) => {
      const itemCode = (item.getAttribute("data-code") || "").toUpperCase();
      const isSelected = itemCode === code;
      item.classList.toggle("selected", isSelected);
      if (isSelected) {
        item.setAttribute("data-hidden-selected", "true");
      } else {
        item.removeAttribute("data-hidden-selected");
      }
    });

    if (countryTrigger) {
      countryTrigger.classList.add("is-active");
    }

    renderStateList();
  }

  function hydrateCountryFromUrlOrDetect() {
    let appliedFromUrl = false;

    if (urlCountrySlug && countries.length) {
      const match = countries.find((c) => {
        const slug = slugifyClient(c.slug || c.name || "");
        return slug === urlCountrySlug;
      });
      if (match && match.code) {
        userCountry = String(match.code).toUpperCase();
        appliedFromUrl = true;
      }
    }

    if (appliedFromUrl) {
      updateCountryDisplay();
    } else {
      detectUserCountry();
    }
  }

  function selectCountry(code, countrySlug) {
    userCountry = code.toUpperCase();
    currentCountrySlug = countrySlug;
    currentStateKey = null;
    currentStateName = "";
    urlStateSlug = null;
    urlCitySlug = null;

    updateCountryDisplay();
    try {
      localStorage.setItem("selectedCountry", userCountry);
    } catch (e) {}

    if (countrySlug) {
      navigateToGeoPage(countrySlug);
    }
  }

  function detectUserCountry() {
    let fromStorage = null;
    try {
      const stored = localStorage.getItem("selectedCountry");
      if (stored) fromStorage = stored.toUpperCase();
    } catch (e) {}

    if (
      fromStorage &&
      countries.some((c) => c.code?.toUpperCase() === fromStorage)
    ) {
      userCountry = fromStorage;
    } else {
      userCountry = "IN";
    }
    updateCountryDisplay();
  }

  /* ================= Dropdown behaviour ================= */

  function toggleCountryDropdown() {
    const isExpanded = countryTrigger.getAttribute("aria-expanded") === "true";
    const next = !isExpanded;
    countryTrigger.setAttribute("aria-expanded", String(next));
    countryDropdown.classList.toggle("open", next);

    if (next && countrySearch) {
      countrySearch.value = "";
      filterCountries();
      countrySearch.focus();
    }

    if (!next) {
      clearGlobalSearchResults();
    }
  }

  function closeCountryDropdown() {
    if (!countryDropdown.classList.contains("open")) return;

    countryTrigger.setAttribute("aria-expanded", "false");
    countryDropdown.classList.remove("open");
    clearGlobalSearchResults();

    if (hasGeoChanged) {
      window.location.reload();
    }
  }

  function filterCountries() {
    if (!countryList) return;
    const term = (countrySearch?.value || "").toLowerCase();
    countryList.querySelectorAll(".country-item").forEach((item) => {
      const name = item
        .querySelector(".country-name")
        .textContent.toLowerCase();
      const hiddenSelected = item.hasAttribute("data-hidden-selected");
      const match = name.includes(term);
      item.style.display = match && !hiddenSelected ? "flex" : "none";
    });
  }

  if (countryTrigger && countryDropdown) {
    countryTrigger.addEventListener("click", toggleCountryDropdown);

    document.addEventListener("click", (e) => {
      if (
        !countryTrigger.contains(e.target) &&
        !countryDropdown.contains(e.target)
      ) {
        closeCountryDropdown();
      }
    });

    if (countrySearch) {
      countrySearch.addEventListener("input", filterCountries);
    }

    countryTrigger.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        toggleCountryDropdown();
      } else if (e.key === "Escape") {
        closeCountryDropdown();
      }
    });
  }

  // Global search events
  if (locationSearchInput && locationSearchResults) {
    locationSearchInput.addEventListener("input", updateGlobalSearchResults);

    locationSearchInput.addEventListener("focus", () => {
      if (locationSearchInput.value.trim()) {
        updateGlobalSearchResults();
      }
    });
  }

  document.addEventListener("click", (e) => {
    const t = e.target;
    if (!(t instanceof Element)) return;

    if (t.closest(".location-search-wrapper")) return;
    clearGlobalSearchResults();
  });

  if (locationSearchInput) {
    locationSearchInput.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        clearGlobalSearchResults();
        locationSearchInput.blur();
      }
    });
  }

  /* ================= Existing nav logic ================= */

  function syncAria() {
    if (label && cb) {
      label.setAttribute("aria-expanded", cb.checked ? "true" : "false");
    }
    if (closeLabel && cb) {
      closeLabel.setAttribute("aria-expanded", cb.checked ? "true" : "false");
    }
  }

  function setBodyOffset() {
    const currentVar =
      parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue(
          "--header-h"
        )
      ) || 96;
    let h = header?.offsetHeight || currentVar;
    if (h < 40) h = currentVar;
    document.documentElement.style.setProperty("--header-h", h + "px");
    document.body.style.paddingTop = h + "px";
  }

  function clearActive() {
    navLinks.forEach((link) => {
      link.classList.remove("is-active");
      link.removeAttribute("aria-current");
    });
  }

  function setActiveFor(target) {
    clearActive();

    if (target === "home") {
      document
        .querySelectorAll(
          '.nav-links .link[href="/"], .mobile-nav .m-link[href="/"]'
        )
        .forEach((link) => {
          link.classList.add("is-active");
          link.setAttribute("aria-current", "page");
        });
      return;
    }

    const selector = `.nav-links .link[href="#${target}"], .mobile-nav .m-link[href="#${target}"]`;
    const matches = document.querySelectorAll(selector);
    if (matches.length) {
      matches.forEach((link) => {
        link.classList.add("is-active");
        link.setAttribute("aria-current", "true");
      });
    } else {
      setActiveFor("home");
    }
  }

  function updateActiveLink() {
    const hash = (window.location.hash || "").replace("#", "");
    if (hash && sectionIds.includes(hash)) {
      setActiveFor(hash);
      return;
    }

    const offset = (header?.offsetHeight || 0) + 40;
    const scrollY = (window.scrollY || 0) + offset;

    let active = "home";
    sectionIds.forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      if (scrollY >= el.offsetTop) {
        active = id;
      }
    });

    setActiveFor(active);
  }

  function onScroll() {
    const y = window.scrollY || 0;
    if (y > 12) header?.classList.add("is-scrolled");
    else header?.classList.remove("is-scrolled");
    updateActiveLink();
  }

  function closeMenu() {
    if (!cb) return;
    cb.checked = false;
    syncAria();
    setTimeout(setBodyOffset, 200);
  }

  document.addEventListener("click", (e) => {
    const target = e.target;
    if (!(target instanceof Element)) return;

    if (
      target.closest(".mobile-nav a") ||
      target.closest(".m-cta") ||
      target.closest(".overlay") ||
      (target.closest(".mobile-drawer") && !target.closest(".mobile-nav")) ||
      target.closest(".close-menu")
    ) {
      closeMenu();
    }

    const navAnchor = target.closest(
      ".nav-links .link, .mobile-nav .m-link, .age-footer .age-navLink, .cta, .m-cta"
    );

    if (!navAnchor) return;

    const href = navAnchor.getAttribute("href") || "";

    if (href.startsWith("#")) {
      const id = href.slice(1);
      const el = document.getElementById(id);
      if (el) {
        e.preventDefault();
        // Increase offset to show full heading - navbar height + extra padding
        const offset = (header?.offsetHeight || 96) + 40;
        const top = el.getBoundingClientRect().top + window.scrollY - offset;

        window.scrollTo({ top, behavior: "smooth" });
        setActiveFor(id);
        history.replaceState(null, "", "#" + id);
      }
    }

    if (href === "/") {
      const samePath =
        window.location.pathname === "/" ||
        window.location.pathname === navAnchor.pathname;
      if (samePath) {
        e.preventDefault();
        window.scrollTo({ top: 0, behavior: "smooth" });
        setActiveFor("home");
      }
    }
  });

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeMenu();
      closeCountryDropdown();
    }
  });

  window.addEventListener(
    "resize",
    () => {
      if (window.innerWidth > 1100) closeMenu();
      setBodyOffset();
    },
    { passive: true }
  );

  window.addEventListener("scroll", onScroll, { passive: true });

  setBodyOffset();

  cb &&
    cb.addEventListener("change", () => {
      syncAria();
      setBodyOffset();
    });

  if (closeLabel) {
    closeLabel.addEventListener("click", (e) => {
      e.preventDefault();
      closeMenu();
    });
  }

  closeLabel &&
    closeLabel.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        closeMenu();
      }
    });

  window.addEventListener(
    "load",
    () => {
      if ("scrollRestoration" in history) history.scrollRestoration = "manual";

      syncAria();
      setBodyOffset();
      onScroll();
      setActiveFor("home");

      fetchCountries();
      fetchStates();
      fetchCities();
      
      // Initialize mobile location selector
      initMobileLocationSelector();
    },
    { once: true }
  );

  if ("ResizeObserver" in window && header) {
    new ResizeObserver(setBodyOffset).observe(header);
  }

  /* ================= Mobile Location Selector ================= */
  
  function initMobileLocationSelector() {
    const mobileBackBtn = document.querySelector('.mobile-back-btn');
    const mobileLocationTrigger = document.querySelector('.m-location-trigger');
    const mobileMenuMain = document.querySelector('[data-step="main"]');
    const mobileCountriesStep = document.querySelector('[data-step="countries"]');
    const mobileStatesStep = document.querySelector('[data-step="states"]');
    const mobileCitiesStep = document.querySelector('[data-step="cities"]');
    const mobileNavTitle = document.querySelector('.mobile-nav-title');
    
    const mobileCountryList = document.querySelector('.mobile-country-list');
    const mobileStateList = document.querySelector('.mobile-state-list');
    const mobileCityList = document.querySelector('.mobile-city-list');
    const mobileCountrySearch = document.querySelector('.mobile-country-search');
    
    const flagPlaceholderMobile = document.querySelector('.flag-placeholder-mobile');
    const countryCodeMobile = document.querySelector('.country-code-mobile');
    
    let currentMobileStep = 'main';
    let mobileSelectedCountry = null;
    let mobileSelectedState = null;
    
    // Update mobile flag display
    function updateMobileFlag() {
      const flagUrl = getFlagUrl(userCountry);
      if (flagPlaceholderMobile && flagUrl) {
        flagPlaceholderMobile.innerHTML = `<img src="${flagUrl}" alt="${userCountry} flag" class="flag-img" loading="lazy" width="20" height="15" />`;
      }
      if (countryCodeMobile) {
        countryCodeMobile.textContent = userCountry;
      }
    }
    
    // Show step
    function showStep(step) {
      // Hide all steps
      if (mobileMenuMain) mobileMenuMain.style.display = 'none';
      if (mobileCountriesStep) mobileCountriesStep.style.display = 'none';
      if (mobileStatesStep) mobileStatesStep.style.display = 'none';
      if (mobileCitiesStep) mobileCitiesStep.style.display = 'none';
      
      // Show current step
      currentMobileStep = step;
      
      switch(step) {
        case 'main':
          if (mobileMenuMain) mobileMenuMain.style.display = 'flex';
          if (mobileNavTitle) mobileNavTitle.textContent = 'Menu';
          if (mobileBackBtn) mobileBackBtn.style.display = 'none';
          break;
        case 'countries':
          if (mobileCountriesStep) mobileCountriesStep.style.display = 'flex';
          if (mobileNavTitle) mobileNavTitle.textContent = 'Select Country';
          if (mobileBackBtn) mobileBackBtn.style.display = 'inline-flex';
          populateMobileCountries();
          break;
        case 'states':
          if (mobileStatesStep) mobileStatesStep.style.display = 'flex';
          if (mobileNavTitle) mobileNavTitle.textContent = 'Select State';
          if (mobileBackBtn) mobileBackBtn.style.display = 'inline-flex';
          populateMobileStates();
          break;
        case 'cities':
          if (mobileCitiesStep) mobileCitiesStep.style.display = 'flex';
          if (mobileNavTitle) mobileNavTitle.textContent = 'Select City';
          if (mobileBackBtn) mobileBackBtn.style.display = 'inline-flex';
          populateMobileCities();
          break;
      }
    }
    
    // Populate mobile countries
    function populateMobileCountries() {
      if (!mobileCountryList) return;
      mobileCountryList.innerHTML = '';
      
      const sorted = [...countries].sort((a, b) =>
        String(a.name || "").localeCompare(String(b.name || ""))
      );
      
      sorted.forEach((country) => {
        if (!country.code || !country.name) return;
        const code = String(country.code).toUpperCase();
        const slug = slugifyClient(country.slug || country.name);
        const url = getFlagUrl(code);
        
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'mobile-location-item';
        btn.innerHTML = `
          <div class="mobile-location-content">
            <span class="mobile-country-flag">
              ${url ? `<img src="${url}" alt="${country.name} flag" class="flag-img" loading="lazy" width="20" height="15" />` : '🌐'}
            </span>
            <span>${country.name}</span>
          </div>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M9 18l6-6-6-6"/>
          </svg>
        `;
        
        btn.addEventListener('click', () => {
          mobileSelectedCountry = { code, slug, name: country.name };
          userCountry = code;
          updateMobileFlag();
          showStep('states');
        });
        
        mobileCountryList.appendChild(btn);
      });
    }
    
    // Populate mobile states
    function populateMobileStates() {
      if (!mobileStateList || !mobileSelectedCountry) return;
      
      const selectedCountryEl = document.querySelector('.mobile-selected-country');
      if (selectedCountryEl) {
        selectedCountryEl.textContent = mobileSelectedCountry.name;
      }
      
      mobileStateList.innerHTML = '';
      const code = mobileSelectedCountry.code;
      const states = (statesByCountry[code] || []).slice().sort((a, b) => a.name.localeCompare(b.name));
      
      if (!states.length) {
        mobileStateList.innerHTML = '<div class="state-empty">No states found for this country.</div>';
        return;
      }
      
      states.forEach((st) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'mobile-location-item';
        btn.innerHTML = `
          <div class="mobile-location-content">
            <span>${st.name}</span>
          </div>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M9 18l6-6-6-6"/>
          </svg>
        `;
        
        btn.addEventListener('click', () => {
          mobileSelectedState = { name: st.name, slug: st.slug, code: st.code };
          currentStateKey = `${code}-${st.code}`;
          currentStateName = st.name;
          currentCountrySlug = mobileSelectedCountry.slug;
          currentStateSlug = st.slug;
          showStep('cities');
        });
        
        mobileStateList.appendChild(btn);
      });
    }
    
    // Populate mobile cities
    function populateMobileCities() {
      if (!mobileCityList || !currentStateKey) return;
      
      const selectedStateEl = document.querySelector('.mobile-selected-state');
      if (selectedStateEl && mobileSelectedState) {
        selectedStateEl.textContent = mobileSelectedState.name;
      }
      
      mobileCityList.innerHTML = '';
      const cities = (citiesByStateKey[currentStateKey] || []).slice().sort((a, b) => a.name.localeCompare(b.name));
      
      if (!cities.length) {
        mobileCityList.innerHTML = '<div class="city-empty">No cities found for this state.</div>';
        return;
      }
      
      cities.forEach((ct) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'mobile-location-item';
        btn.innerHTML = `
          <div class="mobile-location-content">
            <span>${ct.name}</span>
          </div>
        `;
        
        btn.addEventListener('click', () => {
          const cSlug = currentCountrySlug || urlCountrySlug || '';
          const sSlug = currentStateSlug || urlStateSlug || '';
          const citySlug = ct.slug || '';
          
          if (cSlug && citySlug) {
            navigateToGeoPage(cSlug, sSlug, citySlug);
            // Close mobile menu and reset
            if (cb) cb.checked = false;
            showStep('main');
            // Reload page to show new location
            setTimeout(() => window.location.reload(), 300);
          }
        });
        
        mobileCityList.appendChild(btn);
      });
    }
    
    // Country search filter
    if (mobileCountrySearch) {
      mobileCountrySearch.addEventListener('input', (e) => {
        const term = e.target.value.toLowerCase();
        const items = mobileCountryList.querySelectorAll('.mobile-location-item');
        items.forEach(item => {
          const text = item.textContent.toLowerCase();
          item.style.display = text.includes(term) ? 'flex' : 'none';
        });
      });
    }
    
    // Event listeners
    if (mobileLocationTrigger) {
      mobileLocationTrigger.addEventListener('click', () => {
        showStep('countries');
      });
    }
    
    if (mobileBackBtn) {
      mobileBackBtn.addEventListener('click', () => {
        switch(currentMobileStep) {
          case 'countries':
            showStep('main');
            break;
          case 'states':
            showStep('countries');
            break;
          case 'cities':
            showStep('states');
            break;
        }
      });
    }
    
    // Initialize
    updateMobileFlag();
  }
})();
document.addEventListener("DOMContentLoaded", () => {
  const trigger = document.querySelector(".country-trigger");
  const dropdown = document.querySelector(".country-dropdown");
  const closeBtn = document.querySelector(".country-mega-close");

  if (closeBtn && trigger && dropdown) {
    closeBtn.addEventListener("click", () => {
      dropdown.classList.remove("open");
      trigger.classList.remove("is-active");
      trigger.setAttribute("aria-expanded", "false");
    });
  }
});
