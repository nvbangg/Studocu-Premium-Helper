(() => {
  "use strict";

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const setFirstValidOption = (selectEl) => {
    if (!selectEl) return false;

    const validOption = Array.from(selectEl.options).find((opt) => {
      const val = opt.value.trim().toLowerCase();
      const text = opt.text.trim().toLowerCase();
      return val && !val.includes("select") && !text.includes("select") && !text.includes("chọn");
    });

    if (!validOption) return false;

    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
    if (setter) setter.call(selectEl, validOption.value);
    else selectEl.value = validOption.value;

    selectEl.dispatchEvent(new Event("input", { bubbles: true }));
    selectEl.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  };

  const setNativeInputVal = (fieldEl, val) => {
    if (!fieldEl) return;

    if (fieldEl._valueTracker) {
      fieldEl._valueTracker.setValue("");
    }

    const proto =
      fieldEl instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    if (setter) setter.call(fieldEl, val);
    else fieldEl.value = val;

    fieldEl.dispatchEvent(new Event("input", { bubbles: true }));
    fieldEl.dispatchEvent(new Event("change", { bubbles: true }));
  };

  const selectFirstSuggestion = async (queryInput, queryKeyword) => {
    queryInput.focus();
    queryInput.click();
    await sleep(60);

    setNativeInputVal(queryInput, queryKeyword);
    queryInput.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: queryKeyword.slice(-1) }));
    queryInput.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: queryKeyword.slice(-1) }));

    for (let attempt = 0; attempt < 20; attempt++) {
      await sleep(150);

      queryInput.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "ArrowDown", code: "ArrowDown", keyCode: 40 }));
      queryInput.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: "ArrowDown", code: "ArrowDown", keyCode: 40 }));

      const targetOption = document.querySelector(
        "[role='listbox'] [role='option'], [role='listbox'] button, [role='listbox'] li, ul[class*='suggestion' i] li"
      );

      if (targetOption) {
        targetOption.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
        targetOption.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true }));
        targetOption.click();
      }

      queryInput.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Enter", code: "Enter", keyCode: 13 }));
      queryInput.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: "Enter", code: "Enter", keyCode: 13 }));

      await sleep(200);
      const isSelected =
        !document.body.contains(queryInput) ||
        Array.from(document.querySelectorAll("button")).some((btn) =>
          btn.textContent.trim().toLowerCase().includes("apply to all")
        );

      if (isSelected) {
        return true;
      }
    }
    return false;
  };

  const ensureUnivSelected = async () => {
    const univInput = document.querySelector(
      'input[id^="uploader-institution"], input[placeholder*="Search university" i], input[placeholder*="trường" i]'
    );
    if (!univInput) return;
    await selectFirstSuggestion(univInput, "Đại học");
  };

  const ensureCourseSelected = async () => {
    const courseInput = document.querySelector(
      'input[id^="uploader-course"], input[placeholder*="Search by course" i], input[placeholder*="môn" i]'
    );
    if (!courseInput) return;
    await selectFirstSuggestion(courseInput, "a");
  };

  const applySharedCourse = async () => {
    for (let attempt = 0; attempt < 15; attempt++) {
      const applyBtn = Array.from(document.querySelectorAll("button")).find((btn) => {
        const text = btn.textContent.trim().toLowerCase();
        return !btn.disabled && (text === "apply to all" || text.includes("áp dụng cho tất cả"));
      });

      if (applyBtn) {
        applyBtn.click();
        await sleep(350);
        return;
      }
      await sleep(100);
    }
  };

  const resolveDocTitle = (docId) => {
    const titleInput = document.getElementById(`title-${docId}`);
    const existingVal = titleInput?.value?.trim();
    if (existingVal) return existingVal;

    const cardEl =
      document.querySelector(`[data-doc-id="${docId}"]`) ||
      titleInput?.closest("section, div, article");
    const docxMatch = cardEl?.textContent?.match(/[\w.-]+\.docx?/i)?.[0];
    if (docxMatch) {
      return docxMatch
        .replace(/\.docx?$/i, "")
        .replace(/[-_]+/g, " ")
        .replace(/\b\w/g, (char) => char.toUpperCase())
        .trim();
    }

    return "Tài liệu học tập tổng hợp";
  };

  const fill = async () => {
    await ensureUnivSelected();
    await ensureCourseSelected();
    await applySharedCourse();

    let categorySelects = [];
    for (let attempt = 0; attempt < 25; attempt++) {
      categorySelects = Array.from(document.querySelectorAll('select[id^="categoryId-"]'));
      if (categorySelects.length > 0) break;
      await sleep(150);
    }

    if (categorySelects.length === 0) {
      throw new Error("Chưa tìm thấy trường danh mục tài liệu. Hãy chắc chắn các file đã tải xong và đang ở bước thông tin.");
    }

    for (const catSelect of categorySelects) {
      const docId = catSelect.id.replace("categoryId-", "");
      setFirstValidOption(catSelect);
      setFirstValidOption(document.getElementById(`academicYear-${docId}`));
    }

    await sleep(80);

    let filledDocCount = 0;
    for (const catSelect of categorySelects) {
      const docId = catSelect.id.replace("categoryId-", "");
      const titleInput = document.getElementById(`title-${docId}`);
      const descInput = document.getElementById(`description-${docId}`);
      const docTitle = resolveDocTitle(docId);

      if (titleInput && !titleInput.value?.trim()) {
        setNativeInputVal(titleInput, docTitle);
      }
      if (descInput) {
        setNativeInputVal(descInput, titleInput?.value?.trim() || docTitle);
      }

      filledDocCount++;
    }

    return {
      filledCount: filledDocCount,
      message: `Đã điền thông tin thành công cho ${filledDocCount} tài liệu.`,
    };
  };

  window.FormFiller = { fill };
})();
