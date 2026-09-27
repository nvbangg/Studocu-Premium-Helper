(() => {
  "use strict";

  const UPLOAD_URL = "https://www.studocu.vn/vn/document/upload";
  const DEFAULTS = {
    docCount: 10,
    pagesPerFile: 10,
  };

  const clampInteger = (value, min, max, fallback) => {
    const parsedValue = Number.parseInt(value, 10);
    return Number.isFinite(parsedValue)
      ? Math.max(min, Math.min(max, parsedValue))
      : fallback;
  };

  const initPopup = async () => {
    const getElement = (id) => document.getElementById(id);
    const countEl = getElement("doc-count");
    const countBadgeEl = getElement("doc-count-badge");
    const pagesEl = getElement("pages-per-file");
    const pagesBadgeEl = getElement("pages-per-file-badge");
    const btnResetEl = getElement("btn-reset");
    const btnUploadEl = getElement("btn-upload");
    const btnFillEl = getElement("btn-fill");
    const btnDownloadEl = getElement("btn-download");
    const downloadOptionsEl = getElement("download-options");
    const downloadOptionEls = downloadOptionsEl.querySelectorAll("[data-download-mode]");
    const progressBoxEl = getElement("progress-box");
    const progressBarEl = getElement("progress-bar");
    const statEl = getElement("status-text");

    let settings = DEFAULTS;

    try {
      const stored = await chrome.storage.sync.get(DEFAULTS);
      settings = {
        docCount: clampInteger(stored.docCount, 1, 30, DEFAULTS.docCount),
        pagesPerFile: clampInteger(stored.pagesPerFile, 1, 50, DEFAULTS.pagesPerFile),
      };
    } catch {}

    const showStat = (message, percent = null) => {
      progressBoxEl.hidden = false;
      statEl.textContent = message;
      if (percent !== null) {
        progressBarEl.style.width = `${Math.max(0, Math.min(100, percent))}%`;
      }
    };

    const bindSlider = (element, badge, initialValue, storageKey, suffix) => {
      const update = (value) => {
        element.value = value;
        badge.textContent = `${value} ${suffix}`;
      };

      update(initialValue);
      element.addEventListener("input", () => {
        const value = clampInteger(element.value, Number(element.min), Number(element.max), initialValue);
        update(value);
        chrome.storage.sync.set({ [storageKey]: value }).catch(() => {});
      });

      return update;
    };

    const setDocCount = bindSlider(
      countEl,
      countBadgeEl,
      settings.docCount,
      "docCount",
      "file"
    );
    const setPagesPerFile = bindSlider(
      pagesEl,
      pagesBadgeEl,
      settings.pagesPerFile,
      "pagesPerFile",
      "trang"
    );

    btnResetEl.addEventListener("click", () => {
      setDocCount(DEFAULTS.docCount);
      setPagesPerFile(DEFAULTS.pagesPerFile);
      chrome.storage.sync.set(DEFAULTS).catch(() => {});
    });

    const isUploadUrl = (url) => {
      try {
        const parsedUrl = new URL(url);
        return (
          parsedUrl.hostname === "www.studocu.vn" &&
          parsedUrl.pathname.startsWith("/vn/document/upload")
        );
      } catch {
        return false;
      }
    };

    const openUploadPage = async () => {
      await chrome.tabs.create({ url: UPLOAD_URL, active: true });
    };

    const runPageAction = async (button, action, pendingMessage) => {
      button.disabled = true;
      showStat(pendingMessage, 35);

      try {
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!activeTab?.id) {
          await openUploadPage();
          return;
        }

        let response;
        try {
          response = await chrome.tabs.sendMessage(activeTab.id, { type: action });
        } catch {
          if (isUploadUrl(activeTab.url)) {
            throw new Error("Không thể kết nối. Hãy tải lại trang upload rồi thử lại.");
          }
          await openUploadPage();
          return;
        }

        if (!response?.ok) {
          throw new Error(response?.error || "Không thể hoàn thành thao tác.");
        }
        showStat(`✅ ${response.message}`, 100);
      } catch (error) {
        showStat(`❌ ${error.message}`, 0);
      } finally {
        setTimeout(() => {
          button.disabled = false;
        }, 500);
      }
    };

    btnUploadEl.addEventListener("click", () => {
      runPageAction(btnUploadEl, "upload-files", "Đang tạo và nạp tài liệu...");
    });

    btnFillEl.addEventListener("click", () => {
      runPageAction(btnFillEl, "fill-form", "Đang tìm các trường có thể điền...");
    });

    const getDownloadSettings = () => ({
      docCount: clampInteger(countEl.value, 1, 30, DEFAULTS.docCount),
      pageCount: clampInteger(pagesEl.value, 1, 50, DEFAULTS.pagesPerFile),
    });

    const downloadBlob = (blob, name) => {
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = name;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    };

    const runDownload = async (mode) => {
      const { docCount, pageCount } = getDownloadSettings();
      btnDownloadEl.disabled = true;
      downloadOptionEls.forEach((button) => {
        button.disabled = true;
      });
      downloadOptionsEl.hidden = true;
      btnDownloadEl.setAttribute("aria-expanded", "false");

      try {
        if (mode === "zip") {
          showStat("Đang tạo file ZIP...", 35);
          const zipItem = window.DocxGenerator.generateDocxZip(docCount, { pageCount });
          downloadBlob(zipItem.blob, zipItem.name);
          showStat(`✅ Đã tải ZIP chứa ${docCount} file DOCX.`, 100);
        } else {
          for (let i = 0; i < docCount; i++) {
            const percent = Math.round(((i + 1) / docCount) * 100);
            showStat(`Đang tải file ${i + 1}/${docCount}...`, percent);
            const docItem = window.DocxGenerator.generateSingleDocx(i, { pageCount });
            downloadBlob(docItem.blob, docItem.name);

            if (i < docCount - 1) {
              await new Promise((resolve) => setTimeout(resolve, 250));
            }
          }
          showStat(`✅ Đã tải ${docCount} file DOCX.`, 100);
        }
      } catch (error) {
        showStat(`❌ ${error.message}`, 0);
      } finally {
        setTimeout(() => {
          btnDownloadEl.disabled = false;
          downloadOptionEls.forEach((button) => {
            button.disabled = false;
          });
        }, 700);
      }
    };

    btnDownloadEl.addEventListener("click", () => {
      if (!window.DocxGenerator) return;
      downloadOptionsEl.hidden = !downloadOptionsEl.hidden;
      btnDownloadEl.setAttribute("aria-expanded", String(!downloadOptionsEl.hidden));
    });

    downloadOptionEls.forEach((button) => {
      button.addEventListener("click", () => runDownload(button.dataset.downloadMode));
    });
  };

  void initPopup();
})();
