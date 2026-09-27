(() => {
  "use strict";

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const DEFAULTS = {
    docCount: 10,
    pagesPerFile: 10,
  };
  let isUploading = false;

  const clampInteger = (value, min, max, fallback) => {
    const parsedValue = Number.parseInt(value, 10);
    return Number.isFinite(parsedValue)
      ? Math.max(min, Math.min(max, parsedValue))
      : fallback;
  };

  const getConfig = async () => {
    try {
      const syncData = await chrome.storage.sync.get(DEFAULTS);
      return {
        docCount: clampInteger(
          syncData.docCount,
          1,
          30,
          DEFAULTS.docCount
        ),
        pageCount: clampInteger(
          syncData.pagesPerFile,
          1,
          50,
          DEFAULTS.pagesPerFile
        ),
      };
    } catch {
      return {
        docCount: DEFAULTS.docCount,
        pageCount: DEFAULTS.pagesPerFile,
      };
    }
  };

  const setInputFiles = (fileInput, files) => {
    const dataTransfer = new DataTransfer();
    files.forEach((file) => dataTransfer.items.add(file));
    fileInput.files = dataTransfer.files;
    fileInput.dispatchEvent(new Event("input", { bubbles: true }));
    fileInput.dispatchEvent(new Event("change", { bubbles: true }));
  };

  const advanceUploadFlow = async () => {
    for (let attempt = 0; attempt < 40; attempt++) {
      await sleep(500);
      const continueButton = Array.from(document.querySelectorAll("button")).find((button) => {
        const text = button.textContent.trim().toLowerCase();
        return (
          !button.disabled &&
          (text === "continue" ||
            text === "upload" ||
            text.includes("tiếp tục"))
        );
      });
      if (continueButton) {
        continueButton.click();
        return;
      }
    }
  };

  const uploadFiles = async () => {
    if (isUploading) {
      throw new Error("Một lượt nạp file đang được xử lý.");
    }
    if (!window.DocxGenerator) {
      throw new Error("Không tìm thấy bộ tạo DOCX.");
    }

    const fileInput = document.querySelector("input[type='file']");
    if (!fileInput) {
      throw new Error("Không tìm thấy ô tải file. Hãy tải lại trang rồi thử lại.");
    }

    isUploading = true;
    try {
      const { docCount, pageCount } = await getConfig();
      const files = window.DocxGenerator.generateDocxFiles(docCount, { pageCount });
      const firstTitle = files[0]?.generatedTitle;
      if (firstTitle) {
        sessionStorage.setItem("documentHelperLastTitle", firstTitle);
      }

      setInputFiles(fileInput, files);
      void advanceUploadFlow();

      return { message: `Đã nạp ${files.length} file DOCX.` };
    } finally {
      isUploading = false;
    }
  };

  const fillForm = async () => {
    if (!window.FormFiller) {
      throw new Error("Không tìm thấy bộ tự động điền.");
    }
    const result = await window.FormFiller.fill();
    return {
      ...result,
      message: result.message || `Đã điền ${result.filledCount} tài liệu.`,
    };
  };

  const actions = {
    "upload-files": uploadFiles,
    "fill-form": fillForm,
  };

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    const action = actions[message?.type];
    if (typeof action !== "function") return false;

    Promise.resolve()
      .then(action)
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((error) => {
        sendResponse({ ok: false, error: error.message });
      });
    return true;
  });
})();
