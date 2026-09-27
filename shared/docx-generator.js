(() => {
  "use strict";

  const textEncoder = new TextEncoder();
  const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

  const CRC_TABLE = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let crcValue = i;
    for (let bit = 0; bit < 8; bit++) {
      crcValue = crcValue & 1 ? 0xedb88320 ^ (crcValue >>> 1) : crcValue >>> 1;
    }
    CRC_TABLE[i] = crcValue;
  }

  const calcCrc32 = (dataBytes) => {
    let checksum = 0xffffffff;
    for (let i = 0; i < dataBytes.length; i++) {
      checksum = CRC_TABLE[(checksum ^ dataBytes[i]) & 0xff] ^ (checksum >>> 8);
    }
    return (checksum ^ 0xffffffff) >>> 0;
  };

  class SimpleZip {
    constructor() {
      this.files = [];
    }

    addFile(fileName, content) {
      const dataBytes =
        typeof content === "string" ? textEncoder.encode(content) : content;
      this.files.push({
        nameBytes: textEncoder.encode(fileName),
        data: dataBytes,
        crc: calcCrc32(dataBytes),
      });
    }

    generate() {
      const parts = [];
      const entries = [];
      let currentOffset = 0;

      for (const fileItem of this.files) {
        const header = new Uint8Array(30 + fileItem.nameBytes.length);
        const view = new DataView(header.buffer);
        view.setUint32(0, 0x04034b50, true);
        view.setUint16(4, 20, true);
        view.setUint16(6, 0x0800, true);
        view.setUint16(8, 0, true);
        view.setUint32(14, fileItem.crc, true);
        view.setUint32(18, fileItem.data.length, true);
        view.setUint32(22, fileItem.data.length, true);
        view.setUint16(26, fileItem.nameBytes.length, true);
        header.set(fileItem.nameBytes, 30);

        parts.push(header, fileItem.data);
        entries.push({
          nameBytes: fileItem.nameBytes,
          size: fileItem.data.length,
          crc: fileItem.crc,
          offset: currentOffset,
        });
        currentOffset += header.length + fileItem.data.length;
      }

      const cdStartOffset = currentOffset;
      for (const entry of entries) {
        const cdHeader = new Uint8Array(46 + entry.nameBytes.length);
        const view = new DataView(cdHeader.buffer);
        view.setUint32(0, 0x02014b50, true);
        view.setUint16(4, 20, true);
        view.setUint16(6, 20, true);
        view.setUint16(8, 0x0800, true);
        view.setUint16(10, 0, true);
        view.setUint32(16, entry.crc, true);
        view.setUint32(20, entry.size, true);
        view.setUint32(24, entry.size, true);
        view.setUint16(28, entry.nameBytes.length, true);
        view.setUint32(42, entry.offset, true);
        cdHeader.set(entry.nameBytes, 46);

        parts.push(cdHeader);
        currentOffset += cdHeader.length;
      }

      const eocd = new Uint8Array(22);
      const view = new DataView(eocd.buffer);
      view.setUint32(0, 0x06054b50, true);
      view.setUint16(8, entries.length, true);
      view.setUint16(10, entries.length, true);
      view.setUint32(12, currentOffset - cdStartOffset, true);
      view.setUint32(16, cdStartOffset, true);
      parts.push(eocd);

      const totalLen = parts.reduce((acc, part) => acc + part.length, 0);
      const zipBytes = new Uint8Array(totalLen);
      let writeOffset = 0;
      for (const part of parts) {
        zipBytes.set(part, writeOffset);
        writeOffset += part.length;
      }
      return zipBytes;
    }
  }

  const DOC_CONFIG = {
    minWordsPerSentence: 7,
    maxWordsPerSentence: 15,
    defaultPageCount: 10,
    minParagraphsPerPage: 4,
    maxParagraphsPerPage: 5,
    minSentencesPerParagraph: 4,
    maxSentencesPerParagraph: 5,
    minBulletCount: 3,
    maxBulletCount: 5,
  };

  const TITLE_PREFIXES = [
    "Báo cáo nghiên cứu chuyên đề",
    "Tài liệu học tập và thực hành",
    "Đề án phân tích hệ thống",
    "Tiểu luận tổng quan lý thuyết",
    "Tóm tắt kiến thức cốt lõi",
    "Khảo sát và đánh giá thực nghiệm",
    "Đề cương chi tiết học phần",
    "Báo cáo kết quả bài tập lớn",
  ];

  const SECTION_TITLES = [
    "Các điểm trọng tâm:",
    "Nội dung cốt lõi cần lưu ý:",
    "Tổng kết các phát hiện chính:",
    "Mục tiêu và định hướng triển khai:",
    "Đánh giá và bài học kinh nghiệm:",
  ];

  const PUNCTUATIONS = [".", "!", "?", "...", ";", ":"];

  const VOCAB = [
    // Nghiên cứu & Học thuật
    "tài liệu", "nội dung", "hệ thống", "dữ liệu", "phân tích", "tổng hợp", "phương pháp", "kiểm tra",
    "hướng dẫn", "kết quả", "thông tin", "nghiên cứu", "báo cáo", "đánh giá", "thực hiện", "triển khai",
    "xử lý", "quản lý", "cập nhật", "thiết kế", "xây dựng", "phát triển", "giải pháp", "ứng dụng",
    "khảo sát", "thống kê", "mô hình", "cấu trúc", "quy trình", "tiêu chuẩn", "yêu cầu", "đặc điểm",
    "nguyên lý", "lý thuyết", "thực nghiệm", "phương án", "kết luận", "kiến nghị", "tổng quan", "phạm vi",
    "đối tượng", "mục đích", "nhiệm vụ", "giả thuyết", "luận điểm", "chứng minh", "thảo luận", "đề xuất",

    // Công nghệ thông tin & Viễn thông
    "công nghệ", "chất lượng", "hiệu quả", "tối ưu", "thuật toán", "kiến trúc", "mạng máy tính", "trí tuệ nhân tạo",
    "học máy", "cơ sở dữ liệu", "an ninh mạng", "viễn thông", "phần mềm", "phần cứng", "mã nguồn", "lập trình",
    "giao diện", "trải nghiệm", "người dùng", "tính năng", "chức năng", "bảo mật", "an toàn", "tích hợp",
    "liên kết", "truy vấn", "chỉ mục", "bộ nhớ", "bộ xử lý", "máy chủ", "đám mây", "dịch vụ",
    "nền tảng", "giao thức", "băng thông", "định tuyến", "tường lửa", "mã hóa", "chữ ký số", "vi điều khiển",
    "hệ điều hành", "phân tán", "song song", "độ trễ", "thông lượng", "đồng bộ hóa", "tự động hóa", "robotics",

    // Kinh tế, Quản trị & Dự án
    "chiến lược", "mục tiêu", "kế hoạch", "dự án", "ngân sách", "chi phí", "lợi ích", "rủi ro",
    "cơ hội", "thách thức", "xu hướng", "thị trường", "khách hàng", "đối tác", "tài nguyên", "nguồn lực",
    "đào tạo", "hỗ trợ", "tư vấn", "chuyên gia", "kiến thức", "kỹ năng", "kinh nghiệm", "sáng tạo",
    "đổi mới", "cải tiến", "tiến độ", "hiệu suất", "doanh thu", "lợi nhuận", "cạnh tranh", "giá trị",
    "chuỗi cung ứng", "vận hành", "thương mại", "quảng bá", "thương hiệu", "phân khúc", "tiềm năng", "bền vững",

    // Tính từ & Từ bổ trợ học thuật
    "quan trọng", "cần thiết", "then chốt", "toàn diện", "đồng bộ", "hiện đại", "tiên tiến", "linh hoạt",
    "phù hợp", "chính xác", "tin cậy", "khoa học", "thực tiễn", "khả thi", "độc lập", "tương hỗ",
    "trực tiếp", "gián tiếp", "chủ động", "bắt buộc", "cụ thể", "chi tiết", "rõ ràng", "chuyên sâu",
    "cơ bản", "nâng cao", "trọng yếu", "đột phá", "chiều sâu", "quy mô", "tiềm ẩn", "lâu dài"
  ];

  const getRandomInt = (min, max) => min + Math.floor(Math.random() * (max - min + 1));
  const getRandomItem = (items) => items[Math.floor(Math.random() * items.length)];

  const makeSentence = () => {
    const wordCount = getRandomInt(DOC_CONFIG.minWordsPerSentence, DOC_CONFIG.maxWordsPerSentence);
    const words = [];
    for (let i = 0; i < wordCount; i++) {
      words.push(getRandomItem(VOCAB));
    }
    const raw = words.join(" ");
    return raw.charAt(0).toUpperCase() + raw.slice(1) + getRandomItem(PUNCTUATIONS);
  };

  const makeParagraph = (sentenceCount) => {
    const sentences = [];
    for (let i = 0; i < sentenceCount; i++) {
      sentences.push(makeSentence());
    }
    return sentences.join(" ");
  };

  const clampInteger = (value, min, max, fallback) => {
    const parsedValue = Number.parseInt(value, 10);
    return Number.isFinite(parsedValue)
      ? Math.max(min, Math.min(max, parsedValue))
      : fallback;
  };

  const escapeXml = (value) =>
    String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&apos;");

  const CONTENT_TYPES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

  const RELS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

  const buildDocxXml = (title, metaInfo, pages) => {
    let pXml = "";
    pages.forEach((page, pageIndex) => {
      if (pageIndex === 0) {
        pXml += `<w:p><w:pPr><w:jc w:val="left"/><w:spacing w:before="240" w:after="120"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:b/><w:sz w:val="36"/><w:color w:val="1F497D"/></w:rPr><w:t>${escapeXml(title)}</w:t></w:r></w:p>`;
        pXml += `<w:p><w:pPr><w:spacing w:after="240"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:i/><w:sz w:val="20"/><w:color w:val="595959"/></w:rPr><w:t>${escapeXml(metaInfo)}</w:t></w:r></w:p>`;
      } else {
        pXml += `<w:p><w:pPr><w:spacing w:after="180"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:b/><w:sz w:val="26"/><w:color w:val="1F497D"/></w:rPr><w:t>Phần ${pageIndex + 1}</w:t></w:r></w:p>`;
      }

      page.paragraphs.forEach((paragraphText) => {
        pXml += `<w:p><w:pPr><w:spacing w:after="140" w:line="276" w:lineRule="auto"/><w:ind w:firstLine="360"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="24"/></w:rPr><w:t>${escapeXml(paragraphText)}</w:t></w:r></w:p>`;
      });

      pXml += `<w:p><w:pPr><w:spacing w:before="200" w:after="100"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:b/><w:sz w:val="26"/><w:color w:val="1F497D"/></w:rPr><w:t>${escapeXml(page.bulletTitle)}</w:t></w:r></w:p>`;

      page.bullets.forEach((bulletText) => {
        pXml += `<w:p><w:pPr><w:spacing w:after="80"/><w:ind w:left="360"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:b/><w:color w:val="1F497D"/></w:rPr><w:t>• </w:t></w:r><w:r><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="24"/></w:rPr><w:t>${escapeXml(bulletText)}</w:t></w:r></w:p>`;
      });

      if (pageIndex < pages.length - 1) {
        pXml += `<w:p><w:r><w:br w:type="page"/></w:r></w:p>`;
      }
    });

    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${pXml}
    <w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr>
  </w:body>
</w:document>`;
  };

  const generateSingleDocx = (docIndex, options = {}) => {
    const pageCount = clampInteger(options.pageCount, 1, 50, DOC_CONFIG.defaultPageCount);
    const docId =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2) + Date.now().toString(36);

    const titlePrefix = getRandomItem(TITLE_PREFIXES);
    const title = `${titlePrefix} #${docIndex + 1}`;
    const metaInfo = `Tạo lúc: ${new Date().toLocaleString("vi-VN")} | Mã tài liệu: ${docId}`;
    const pages = [];
    for (let pageIndex = 0; pageIndex < pageCount; pageIndex++) {
      const paragraphCount = getRandomInt(
        DOC_CONFIG.minParagraphsPerPage,
        DOC_CONFIG.maxParagraphsPerPage
      );
      const paragraphs = [];
      for (let i = 0; i < paragraphCount; i++) {
        const sentenceCount = getRandomInt(
          DOC_CONFIG.minSentencesPerParagraph,
          DOC_CONFIG.maxSentencesPerParagraph
        );
        paragraphs.push(makeParagraph(sentenceCount));
      }

      const bullets = [];
      const bulletCount = getRandomInt(DOC_CONFIG.minBulletCount, DOC_CONFIG.maxBulletCount);
      for (let i = 0; i < bulletCount; i++) {
        bullets.push(makeSentence());
      }

      pages.push({
        paragraphs,
        bullets,
        bulletTitle: getRandomItem(SECTION_TITLES),
      });
    }

    const docXml = buildDocxXml(title, metaInfo, pages);
    const zip = new SimpleZip();
    zip.addFile("[Content_Types].xml", CONTENT_TYPES_XML);
    zip.addFile("_rels/.rels", RELS_XML);
    zip.addFile("word/document.xml", docXml);

    const docBytes = zip.generate();
    const fileName = `docx_${docIndex + 1}_${docId.slice(0, 8)}.docx`;

    return {
      name: fileName,
      title,
      bytes: docBytes,
      blob: new Blob([docBytes], { type: DOCX_MIME }),
    };
  };

  const generateDocxFiles = (docCount = 10, options = {}) => {
    const normalizedCount = clampInteger(docCount, 1, 30, 10);
    const docFiles = [];
    for (let i = 0; i < normalizedCount; i++) {
      const docItem = generateSingleDocx(i, options);
      const file = new File([docItem.bytes], docItem.name, { type: DOCX_MIME });
      Object.defineProperty(file, "generatedTitle", {
        value: docItem.title,
        enumerable: false,
      });
      docFiles.push(file);
    }
    return docFiles;
  };

  const generateDocxZip = (docCount = 10, options = {}) => {
    const normalizedCount = clampInteger(docCount, 1, 30, 10);
    const zip = new SimpleZip();
    for (let i = 0; i < normalizedCount; i++) {
      const docItem = generateSingleDocx(i, options);
      zip.addFile(docItem.name, docItem.bytes);
    }
    return {
      name: `documents_${normalizedCount}.zip`,
      blob: new Blob([zip.generate()], { type: "application/zip" }),
    };
  };

  const DocxGenerator = {
    generateSingleDocx,
    generateDocxFiles,
    generateDocxZip,
  };

  if (typeof window !== "undefined") {
    window.DocxGenerator = DocxGenerator;
  }
  if (typeof module !== "undefined" && module.exports) {
    module.exports = DocxGenerator;
  }
})();
