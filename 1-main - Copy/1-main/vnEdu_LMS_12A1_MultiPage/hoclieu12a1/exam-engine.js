/* ==========================================================================
   EXAM ENGINE - HỌC LIỆU 12A1.1 PRO
   - Bộ đọc file đa định dạng (.docx / WPS, .pdf, .doc, .rtf, .txt, .json, HTML)
   - Pipeline chuẩn hóa văn bản (Text Normalization)
   - Bộ bóc tách đề chuẩn Tốt nghiệp THPT mới 3 phần (MCQ / Đúng-Sai / Trả lời ngắn)
   - Bộ bóc tách File Đáp Án & đối chiếu (mapping) theo Phần + Số câu
   - Bộ chấm điểm chuẩn Bộ GD&ĐT (lũy tiến Đúng/Sai, chuẩn hóa số thập phân)
   ========================================================================== */

export const MCQ_LETTERS = ["A", "B", "C", "D"];
export const TF_STATEMENT_KEYS = ["a", "b", "c", "d"];

export const QUESTION_TYPES = {
  MCQ: "mcq",
  TRUE_FALSE: "true_false",
  SHORT_ANSWER: "short_answer"
};

export const PART_BY_TYPE = {
  mcq: 1,
  true_false: 2,
  short_answer: 3
};

export const TYPE_BY_PART = {
  1: "mcq",
  2: "true_false",
  3: "short_answer"
};

export const PART_TITLES = {
  1: "PHẦN I. Câu trắc nghiệm nhiều phương án lựa chọn",
  2: "PHẦN II. Câu trắc nghiệm Đúng / Sai",
  3: "PHẦN III. Câu trắc nghiệm Trả lời ngắn"
};

export const DEFAULT_POINTS = {
  mcq: 0.25,
  true_false: 1.0,
  short_answer: 0.25
};

// Bảng điểm lũy tiến Phần II theo quy định Bộ GD&ĐT (tính theo tỉ lệ điểm tối đa của câu = 1.0)
export const TRUE_FALSE_PROGRESSIVE_TABLE = {
  0: 0,
  1: 0.1,
  2: 0.25,
  3: 0.5,
  4: 1.0
};

export class ExamParseError extends Error {
  constructor(message) {
    super(message);
    this.name = "ExamParseError";
  }
}

const VI_LETTER_CLASS = "A-Za-zÀ-ỹ";
const PDF_WORKER_SRC = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

/* ==========================================================================
   1. TIỆN ÍCH CHUNG
   ========================================================================== */
export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function roundScore(value, decimals = 2) {
  const factor = Math.pow(10, decimals);
  return Math.round((Number(value) || 0) * factor) / factor;
}

function toPositiveNumber(value, fallback) {
  const n = typeof value === "string" ? Number(value.replace(",", ".")) : Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function stripOptionPrefix(text) {
  return String(text ?? "")
    .replace(/^\s*\*?\s*[A-D]\s*\*?\s*[.):]\s*/, "")
    .trim();
}

export function stripStatementPrefix(text) {
  return String(text ?? "")
    .replace(/^\s*\*?\s*[a-d]\s*\*?\s*[.):]\s*/, "")
    .trim();
}

export function formatOptionLabel(letter, text) {
  const clean = stripOptionPrefix(text);
  return clean ? `${letter}. ${clean}` : `${letter}.`;
}

/* ==========================================================================
   2. PIPELINE CHUẨN HÓA VĂN BẢN (TEXT NORMALIZATION)
   ========================================================================== */
export function normalizeExamText(raw) {
  let text = String(raw ?? "");

  // Bỏ BOM và chuẩn hóa xuống dòng của Windows / Mac cổ / WPS
  text = text.replace(/^\uFEFF/, "");
  text = text.replace(/\r\n?/g, "\n");
  text = text.replace(/[\u000B\u000C\u0085\u2028\u2029]/g, "\n");

  // Khoảng trắng đặc biệt của Word / WPS / PDF (NBSP, tab, em-space, ideographic space...)
  text = text.replace(/[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000\t]/g, " ");

  // Ký tự vô hình (zero-width, soft hyphen)
  text = text.replace(/[\u200B-\u200D\u2060\uFEFF\u00AD]/g, "");

  // Tổ hợp dấu tiếng Việt dạng rời (decomposed) -> dạng dựng sẵn (NFC) để Regex nhận diện "Câu", "PHẦN"
  text = text.normalize("NFC");

  // Chuẩn hóa ký tự dấu câu toàn chiều rộng và các loại gạch ngang / dấu trừ
  text = text
    .replace(/[\u2018\u2019\u201A\u2032]/g, "'")
    .replace(/[\u201C\u201D\u201E\u2033]/g, '"')
    .replace(/\uFF0E/g, ".")
    .replace(/\uFF1A/g, ":")
    .replace(/\uFF08/g, "(")
    .replace(/\uFF09/g, ")")
    .replace(/\uFF0C/g, ",")
    .replace(/[\u2010\u2011\u2012\u2013\u2014\u2015\u2212]/g, "-");

  // Gộp khoảng trắng thừa và cắt khoảng trắng đầu/cuối dòng
  text = text.replace(/ {2,}/g, " ");
  text = text
    .split("\n")
    .map((line) => line.trim())
    .join("\n");

  // Tách các mốc "PHẦN ..." và "Câu N:" bị dính liền trên cùng 1 dòng (thường gặp ở PDF / WPS)
  text = text.replace(/([^\n]) +(?=(?:PHẦN|Phần|PART)\s+(?:IV|III|II|I|[1-4])\s*[.:\-)])/gu, "$1\n");
  text = text.replace(
    /([^\n]) +(?=(?:Câu|CÂU|Bài|BÀI|Question)\s*\d{1,3}\s*(?:\([^)\n]{1,15}\))?\s*[:.\-)])/gu,
    "$1\n"
  );

  text = text.replace(/\n{3,}/g, "\n\n");
  return text.trim();
}

/* ==========================================================================
   3. BỘ ĐỌC FILE ĐA ĐỊNH DẠNG (MULTI-FORMAT READER)
   ========================================================================== */
function readFileWithFileReader(file, mode, encoding) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error(`Không thể đọc file "${file.name}".`));
    reader.onabort = () => reject(new Error(`Đã hủy đọc file "${file.name}".`));
    if (mode === "text") {
      reader.readAsText(file, encoding || "UTF-8");
    } else {
      reader.readAsArrayBuffer(file);
    }
  });
}

function detectFileSignature(bytes) {
  if (bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) {
    return "zip";
  }
  if (bytes.length >= 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) {
    return "pdf";
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0xd0 &&
    bytes[1] === 0xcf &&
    bytes[2] === 0x11 &&
    bytes[3] === 0xe0 &&
    bytes[4] === 0xa1 &&
    bytes[5] === 0xb1 &&
    bytes[6] === 0x1a &&
    bytes[7] === 0xe1
  ) {
    return "ole";
  }
  if (bytes.length >= 5) {
    const head = String.fromCharCode(...bytes.subarray(0, Math.min(bytes.length, 64))).toLowerCase();
    if (head.startsWith("{\\rtf")) return "rtf";
    if (head.includes("<html") || head.includes("<!doctype html") || head.includes("mime-version")) return "html";
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) return "utf16le";
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) return "utf16be";
  return "text";
}

function countReplacementChars(text) {
  const matches = String(text).match(/\uFFFD/g);
  return matches ? matches.length : 0;
}

async function readPlainTextFileSmart(file, bytes) {
  const signature = detectFileSignature(bytes);
  if (signature === "utf16le") return await readFileWithFileReader(file, "text", "UTF-16LE");
  if (signature === "utf16be") return await readFileWithFileReader(file, "text", "UTF-16BE");

  const utf8Text = await readFileWithFileReader(file, "text", "UTF-8");
  const brokenRatio = countReplacementChars(utf8Text) / Math.max(1, utf8Text.length);
  if (brokenRatio > 0.002) {
    // File .txt lưu bằng bảng mã Windows-1258 (TCVN cũ của Notepad / WPS)
    try {
      const legacyText = await readFileWithFileReader(file, "text", "windows-1258");
      if (countReplacementChars(legacyText) < countReplacementChars(utf8Text)) return legacyText;
    } catch (_) {
      return utf8Text;
    }
  }
  return utf8Text;
}

function ensurePdfJsReady() {
  if (typeof window === "undefined" || typeof window.pdfjsLib === "undefined") {
    throw new Error("Thư viện pdf.js chưa được tải. Vui lòng kiểm tra kết nối mạng rồi tải lại trang.");
  }
  if (!window.pdfjsLib.GlobalWorkerOptions.workerSrc) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDF_WORKER_SRC;
  }
  return window.pdfjsLib;
}

/**
 * Đọc PDF, gom các mẩu chữ theo tọa độ trục Y (transform[5]) thành từng dòng,
 * sắp xếp theo trục X (transform[4]) để giữ nguyên cấu trúc xuống dòng của câu hỏi và đáp án.
 */
export async function extractTextFromPdfArrayBuffer(arrayBuffer) {
  const pdfjsLib = ensurePdfJsReady();
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) });
  const pdf = await loadingTask.promise;
  const pageTexts = [];

  try {
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const content = await page.getTextContent();
      const rows = [];

      content.items.forEach((item) => {
        if (!item || typeof item.str !== "string" || !Array.isArray(item.transform)) return;
        const x = item.transform[4];
        const y = item.transform[5];
        const height = Math.abs(item.height || item.transform[3] || item.transform[0] || 10) || 10;
        const tolerance = Math.max(2, height * 0.45);

        let row = null;
        for (let i = 0; i < rows.length; i++) {
          if (Math.abs(rows[i].y - y) <= tolerance) {
            row = rows[i];
            break;
          }
        }
        if (!row) {
          row = { y, items: [] };
          rows.push(row);
        }
        row.items.push({ x, width: item.width || 0, height, str: item.str });
      });

      rows.sort((a, b) => b.y - a.y);

      const lines = rows
        .map((row) => {
          row.items.sort((a, b) => a.x - b.x);
          let line = "";
          let previousEnd = null;
          row.items.forEach((piece) => {
            if (!piece.str) return;
            if (previousEnd !== null) {
              const gap = piece.x - previousEnd;
              if (gap > piece.height * 0.18 && !line.endsWith(" ") && !piece.str.startsWith(" ")) {
                line += " ";
              }
            }
            line += piece.str;
            previousEnd = piece.x + piece.width;
          });
          return line.replace(/\s+/g, " ").trim();
        })
        .filter(Boolean);

      pageTexts.push(lines.join("\n"));
      page.cleanup();
    }
  } finally {
    await pdf.destroy();
  }

  return pageTexts.join("\n\n");
}

export async function extractTextFromDocxArrayBuffer(arrayBuffer) {
  if (typeof window === "undefined" || typeof window.mammoth === "undefined") {
    throw new Error("Thư viện mammoth.js chưa được tải. Vui lòng kiểm tra kết nối mạng rồi tải lại trang.");
  }
  const result = await window.mammoth.extractRawText({ arrayBuffer });
  return result.value || "";
}

/**
 * Chuyển RTF (Word / WPS "Rich Text") sang văn bản thuần, hỗ trợ \uN tiếng Việt và \'hh theo bảng mã \ansicpg.
 */
export function rtfToPlainText(rtf) {
  const destinations = new Set([
    "aftncn", "aftnsep", "aftnsepc", "annotation", "atnauthor", "atndate", "atnicn", "atnid", "atnparent",
    "atnref", "atntime", "atrfend", "atrfstart", "author", "background", "bkmkend", "bkmkstart", "blipuid",
    "buptim", "category", "colorschememapping", "colortbl", "comment", "company", "creatim", "datafield",
    "datastore", "defchp", "defpap", "do", "doccomm", "docvar", "dptxbxtext", "ebcend", "ebcstart",
    "factoidname", "falt", "fchars", "ffdeftext", "ffentrymcr", "ffexitmcr", "ffformat", "ffhelptext", "ffl",
    "ffname", "ffstattext", "file", "filetbl", "fldinst", "fldtype", "fname", "fontemb", "fontfile",
    "fonttbl", "footer", "footerf", "footerl", "footerr", "footnote", "formfield", "ftncn", "ftnsep",
    "ftnsepc", "g", "generator", "gridtbl", "header", "headerf", "headerl", "headerr", "hl", "hlfr",
    "hlinkbase", "hlloc", "hlsrc", "hsv", "htmltag", "info", "keycode", "keywords", "latentstyles",
    "lchars", "levelnumbers", "leveltext", "lfolevel", "linkval", "list", "listlevel", "listname",
    "listoverride", "listoverridetable", "listpicture", "liststylename", "listtable", "listtext",
    "lsdlockedexcept", "macc", "maccPr", "mailmerge", "maln", "malnScr", "manager", "margPr", "mbar",
    "mbarPr", "mbaseJc", "mbegChr", "mborderBox", "mborderBoxPr", "mbox", "mboxPr", "mchr", "mcount",
    "mctrlPr", "md", "mdeg", "mdegHide", "mden", "mdiff", "mdPr", "me", "mendChr", "meqArr", "meqArrPr",
    "mf", "mfName", "mfPr", "mfunc", "mfuncPr", "mgroupChr", "mgroupChrPr", "mgrow", "mhideBot",
    "mhideLeft", "mhideRight", "mhideTop", "mhtmltag", "mlim", "mlimloc", "mlimlow", "mlimlowPr",
    "mlimupp", "mlimuppPr", "mm", "mmaddfieldname", "mmath", "mmathPict", "mmathPr", "mmaxdist", "mmc",
    "mmcJc", "mmconnectstr", "mmconnectstrdata", "mmcPr", "mmcs", "mmdatasource", "mmheadersource",
    "mmmailsubject", "mmodso", "mmodsofilter", "mmodsofldmpdata", "mmodsomappedname", "mmodsoname",
    "mmodsorecipdata", "mmodsosort", "mmodsosrc", "mmodsotable", "mmodsoudl", "mmodsoudldata",
    "mmodsouniquetag", "mmPr", "mmquery", "mmr", "mnary", "mnaryPr", "mnoBreak", "mnum", "mobjDist",
    "moMath", "moMathPara", "moMathParaPr", "mopEmu", "mphant", "mphantPr", "mplcHide", "mpos", "mr",
    "mrad", "mradPr", "mrPr", "msepChr", "mshow", "mshp", "msPre", "msPrePr", "msSub", "msSubPr",
    "msSubSup", "msSubSupPr", "msSup", "msSupPr", "mstrikeBLTR", "mstrikeH", "mstrikeTLBR", "mstrikeV",
    "msub", "msubHide", "msup", "msupHide", "mtransp", "mtype", "mvertJc", "mvfmf", "mvfml", "mvtof",
    "mvtol", "mzeroAsc", "mzeroDesc", "mzeroWid", "nesttableprops", "nextfile", "nonesttables",
    "objalias", "objclass", "objdata", "object", "objname", "objsect", "objtime", "oldcprops",
    "oldpprops", "oldsprops", "oldtprops", "oleclsid", "operator", "panose", "password", "passwordhash",
    "pgp", "pgptbl", "picprop", "pict", "pn", "pnseclvl", "pntext", "pntxta", "pntxtb", "printim",
    "private", "propname", "protend", "protstart", "protusertbl", "pxe", "result", "revtbl", "revtim",
    "rsidtbl", "rxe", "shp", "shpgrp", "shpinst", "shppict", "shprslt", "shptxt", "sn", "sp", "staticval",
    "stylesheet", "subject", "sv", "svb", "tc", "template", "themedata", "title", "txe", "ud", "upr",
    "userprops", "wgrffmtfilter", "windowcaption", "writereservation", "writereservhash", "xe", "xform",
    "xmlattrname", "xmlattrvalue", "xmlclose", "xmlname", "xmlnstbl", "xmlopen"
  ]);

  const specialChars = {
    par: "\n",
    sect: "\n\n",
    page: "\n\n",
    line: "\n",
    row: "\n",
    cell: " ",
    tab: " ",
    emdash: "-",
    endash: "-",
    emspace: " ",
    enspace: " ",
    qmspace: " ",
    bullet: "•",
    lquote: "'",
    rquote: "'",
    ldblquote: '"',
    rdblquote: '"'
  };

  let codepage = 1252;
  const cpMatch = rtf.match(/\\ansicpg(\d+)/);
  if (cpMatch) codepage = parseInt(cpMatch[1], 10);

  let byteDecoder;
  try {
    byteDecoder = new TextDecoder(`windows-${codepage}`);
  } catch (_) {
    byteDecoder = new TextDecoder("windows-1252");
  }

  const tokenRegex = /\\([a-zA-Z]{1,32})(-?\d{1,10})? ?|\\'([0-9a-fA-F]{2})|\\([^a-zA-Z])|([{}])|[\r\n]+|(.)/gs;
  const stack = [];
  let ignorable = false;
  let ucSkip = 1;
  let curSkip = 0;
  let out = "";
  let pendingBytes = [];

  const flushBytes = () => {
    if (pendingBytes.length > 0) {
      out += byteDecoder.decode(new Uint8Array(pendingBytes));
      pendingBytes = [];
    }
  };

  let match;
  while ((match = tokenRegex.exec(rtf)) !== null) {
    const [, word, arg, hex, char, brace, tchar] = match;

    if (hex === undefined) flushBytes();

    if (brace) {
      curSkip = 0;
      if (brace === "{") {
        stack.push({ ucSkip, ignorable });
      } else {
        const prev = stack.pop();
        if (prev) {
          ucSkip = prev.ucSkip;
          ignorable = prev.ignorable;
        }
      }
    } else if (char) {
      curSkip = 0;
      if (char === "~") {
        if (!ignorable) out += " ";
      } else if (char === "{" || char === "}" || char === "\\") {
        if (!ignorable) out += char;
      } else if (char === "*") {
        ignorable = true;
      } else if (char === "_") {
        if (!ignorable) out += "-";
      } else if (char === "\n" || char === "\r") {
        if (!ignorable) out += "\n";
      }
    } else if (word) {
      curSkip = 0;
      if (destinations.has(word)) {
        ignorable = true;
      } else if (ignorable) {
        continue;
      } else if (Object.prototype.hasOwnProperty.call(specialChars, word)) {
        out += specialChars[word];
      } else if (word === "uc") {
        ucSkip = parseInt(arg || "1", 10);
      } else if (word === "u") {
        let code = parseInt(arg || "0", 10);
        if (code < 0) code += 65536;
        out += String.fromCharCode(code);
        curSkip = ucSkip;
      }
    } else if (hex !== undefined) {
      if (curSkip > 0) {
        curSkip--;
      } else if (!ignorable) {
        pendingBytes.push(parseInt(hex, 16));
      }
    } else if (tchar !== undefined) {
      if (curSkip > 0) {
        curSkip--;
      } else if (!ignorable) {
        out += tchar;
      }
    }
  }
  flushBytes();
  return out;
}

function htmlToPlainText(html) {
  const prepared = String(html)
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/\s*(p|div|li|tr|h[1-6]|table|section|article)\s*>/gi, "\n")
    .replace(/<\/\s*(td|th)\s*>/gi, " ");
  if (typeof DOMParser !== "undefined") {
    const docParsed = new DOMParser().parseFromString(prepared, "text/html");
    docParsed.querySelectorAll("script,style").forEach((el) => el.remove());
    return docParsed.body ? docParsed.body.textContent || "" : prepared.replace(/<[^>]+>/g, " ");
  }
  return prepared.replace(/<[^>]+>/g, " ");
}

/**
 * Trích văn bản từ file Word 97-2003 (.doc) / WPS (.wps) dạng nhị phân OLE bằng heuristic UTF-16LE + Windows-1252.
 */
function extractTextFromLegacyBinaryDoc(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  const evenLength = bytes.length - (bytes.length % 2);
  const readableClass =
    "[\\u0020-\\u007E\\u00A0-\\u024F\\u0300-\\u036F\\u1E00-\\u1EFF\\u2010-\\u2027\\u2030-\\u205E\\u2190-\\u22FF\\n\\r]";
  const runRegex = new RegExp(`${readableClass}{6,}`, "gu");

  const utf16Text = new TextDecoder("utf-16le").decode(bytes.subarray(0, evenLength));
  const utf16Runs = (utf16Text.match(runRegex) || []).join("\n");

  const ansiText = new TextDecoder("windows-1252").decode(bytes);
  const ansiRuns = (ansiText.match(/[\x20-\x7E\xC0-\xFF\n\r]{6,}/g) || []).join("\n");

  const scoreText = (txt) => {
    const keywordHits = (txt.match(/(?:Câu|Bài|Question)\s*\d/giu) || []).length;
    return keywordHits * 1000 + txt.length;
  };

  return scoreText(utf16Runs) >= scoreText(ansiRuns) ? utf16Runs : ansiRuns;
}

/**
 * Đọc mọi định dạng file đề / đáp án thành chuỗi văn bản đã chuẩn hóa.
 * Ưu tiên nhận diện theo chữ ký nhị phân (magic bytes) thay vì chỉ dựa vào phần mở rộng,
 * nên file WPS lưu nhầm đuôi (.doc thực chất là .docx / RTF / HTML) vẫn đọc được.
 */
export async function readExamFileAsText(file) {
  if (!file) throw new Error("Chưa chọn file.");
  if (file.size === 0) throw new ExamParseError(`File "${file.name}" hoàn toàn trống (0 byte).`);

  const extension = (file.name.split(".").pop() || "").toLowerCase();
  const arrayBuffer = await readFileWithFileReader(file, "arraybuffer");
  const bytes = new Uint8Array(arrayBuffer);
  const signature = detectFileSignature(bytes);
  let rawText = "";

  if (signature === "pdf") {
    rawText = await extractTextFromPdfArrayBuffer(arrayBuffer);
    if (!rawText.trim()) {
      throw new ExamParseError(
        `File PDF "${file.name}" không có lớp văn bản (PDF dạng ảnh scan). Vui lòng xuất lại PDF từ Word/WPS hoặc dùng file .docx.`
      );
    }
  } else if (signature === "zip") {
    rawText = await extractTextFromDocxArrayBuffer(arrayBuffer);
  } else if (signature === "rtf") {
    const asciiText = new TextDecoder("windows-1252").decode(bytes);
    rawText = rtfToPlainText(asciiText);
  } else if (signature === "html") {
    const htmlText = await readFileWithFileReader(file, "text", "UTF-8");
    rawText = htmlToPlainText(htmlText);
  } else if (signature === "ole") {
    rawText = extractTextFromLegacyBinaryDoc(arrayBuffer);
    if (!rawText.trim()) {
      throw new ExamParseError(
        `Không trích xuất được văn bản từ file Word 97-2003 "${file.name}". Vui lòng mở bằng Word/WPS và "Lưu thành" .docx.`
      );
    }
  } else if (extension === "docx") {
    rawText = await extractTextFromDocxArrayBuffer(arrayBuffer);
  } else {
    rawText = await readPlainTextFileSmart(file, bytes);
    const trimmedStart = rawText.trimStart();
    if (trimmedStart.startsWith("{\\rtf")) rawText = rtfToPlainText(rawText);
    else if (/^<(!doctype|html)/i.test(trimmedStart)) rawText = htmlToPlainText(rawText);
  }

  const trimmedRaw = rawText.trim();
  if (trimmedRaw.startsWith("[") || trimmedRaw.startsWith("{")) {
    return trimmedRaw;
  }
  return normalizeExamText(rawText);
}

/* ==========================================================================
   4. CHUẨN HÓA DỮ LIỆU CÂU HỎI (EXAM SCHEMA)
   ========================================================================== */
export function parseTrueFalseToken(token) {
  const t = String(token ?? "").trim().toLowerCase();
  if (["đ", "đúng", "dung", "d", "true", "t", "1", "x"].includes(t)) return true;
  if (["s", "sai", "false", "f", "0"].includes(t)) return false;
  return null;
}

/**
 * Phân tích đáp án Đúng/Sai: "a-Đ, b-S, c-Đ, d-Đ" | "a) Đúng b) Sai" | "Đ-S-Đ-Đ" | "ĐSĐĐ" | "Đúng, Sai, Đúng, Đúng"
 */
export function parseTrueFalseAnswer(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const result = {};
    TF_STATEMENT_KEYS.forEach((key) => {
      if (typeof value[key] === "boolean") result[key] = value[key];
      else if (value[key] !== undefined && value[key] !== null) {
        const parsed = parseTrueFalseToken(value[key]);
        if (parsed !== null) result[key] = parsed;
      }
    });
    return Object.keys(result).length > 0 ? result : null;
  }

  const source = String(value ?? "").normalize("NFC").trim();
  if (!source) return null;

  const keyed = {};
  const keyedRegex = new RegExp(
    `(?:^|[^${VI_LETTER_CLASS}])([a-d])\\s*[).:=\\-]?\\s*(đúng|sai|true|false|đ|s|t|f)(?![${VI_LETTER_CLASS}])`,
    "giu"
  );
  let match;
  while ((match = keyedRegex.exec(source)) !== null) {
    const key = match[1].toLowerCase();
    const parsed = parseTrueFalseToken(match[2]);
    if (parsed !== null) keyed[key] = parsed;
  }
  if (Object.keys(keyed).length > 0) return keyed;

  const compact = source.replace(/[\s,;\-/|.()]+/g, "");
  if (compact && /^(?:đúng|sai|true|false|đ|s|t|f)+$/iu.test(compact)) {
    const tokens = compact.match(/đúng|sai|true|false|đ|s|t|f/giu) || [];
    if (tokens.length >= 1 && tokens.length <= 4) {
      const sequential = {};
      tokens.forEach((tok, idx) => {
        const parsed = parseTrueFalseToken(tok);
        if (parsed !== null) sequential[TF_STATEMENT_KEYS[idx]] = parsed;
      });
      return Object.keys(sequential).length > 0 ? sequential : null;
    }
  }
  return null;
}

export function extractMcqLetter(value) {
  const source = String(value ?? "").normalize("NFC");
  const match = source.match(new RegExp(`(?:^|[^${VI_LETTER_CLASS}0-9])([A-D])(?![${VI_LETTER_CLASS}0-9])`, "u"));
  return match ? match[1] : null;
}

export function cleanShortAnswerKey(value) {
  const cleaned = String(value ?? "")
    .normalize("NFC")
    .trim()
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/[;]+$/g, "")
    .replace(/(\d)\.$/, "$1")
    .trim();
  return cleaned;
}

/**
 * Chuẩn hóa mọi câu hỏi (mới hoặc dữ liệu cũ) về cùng 1 schema chuẩn 3 phần.
 */
export function normalizeQuestionSchema(rawQuestion, index = 0) {
  const q = rawQuestion && typeof rawQuestion === "object" ? rawQuestion : {};
  let type = q.type;
  const hasStatements = Array.isArray(q.statements) && q.statements.length > 0;
  const hasOptions = Array.isArray(q.options) && q.options.filter((o) => String(o ?? "").trim() !== "").length >= 2;

  // Dữ liệu cũ: "true_false" chỉ có 2 lựa chọn ["Đúng","Sai"] -> chuyển thành 1 mệnh đề Đúng/Sai
  const isLegacyBinaryTrueFalse =
    type === "true_false" &&
    !hasStatements &&
    Array.isArray(q.options) &&
    q.options.length === 2 &&
    q.options.every((o) => parseTrueFalseToken(o) !== null);

  if (!Object.values(QUESTION_TYPES).includes(type)) {
    if (hasStatements) type = QUESTION_TYPES.TRUE_FALSE;
    else if (hasOptions) type = QUESTION_TYPES.MCQ;
    else type = QUESTION_TYPES.SHORT_ANSWER;
  }
  if (type === QUESTION_TYPES.TRUE_FALSE && !hasStatements && hasOptions && !isLegacyBinaryTrueFalse) {
    type = QUESTION_TYPES.MCQ;
  }

  const base = {
    id: index + 1,
    number: Number.isFinite(Number(q.number)) && Number(q.number) > 0 ? Number(q.number) : index + 1,
    type,
    part: PART_BY_TYPE[type],
    level: q.level || "",
    text: String(q.text ?? "").trim(),
    explanation: String(q.explanation ?? "").trim(),
    points: toPositiveNumber(q.points, DEFAULT_POINTS[type])
  };

  if (type === QUESTION_TYPES.MCQ) {
    const options = MCQ_LETTERS.map((_, i) => stripOptionPrefix((q.options || [])[i] ?? ""));
    const letter = extractMcqLetter(q.correct);
    return { ...base, options, statements: [], correct: letter };
  }

  if (type === QUESTION_TYPES.TRUE_FALSE) {
    let statements;
    let correct;
    if (isLegacyBinaryTrueFalse) {
      statements = [{ key: "a", text: base.text }];
      const parsed = parseTrueFalseToken(q.correct);
      correct = parsed === null ? {} : { a: parsed };
      base.text = "Xác định tính Đúng / Sai của mệnh đề sau:";
    } else {
      statements = TF_STATEMENT_KEYS.map((key, i) => {
        const found = (q.statements || []).find((s) => s && String(s.key).toLowerCase() === key);
        const source = found || (q.statements || [])[i];
        return { key, text: stripStatementPrefix(source ? source.text ?? source : "") };
      });
      correct = parseTrueFalseAnswer(q.correct) || {};
    }
    return { ...base, options: [], statements, correct };
  }

  const shortKey = Array.isArray(q.correct) ? q.correct.join(" | ") : cleanShortAnswerKey(q.correct ?? "");
  return { ...base, options: [], statements: [], correct: shortKey };
}

export function hasValidAnswer(question) {
  if (!question) return false;
  if (question.type === QUESTION_TYPES.MCQ) return MCQ_LETTERS.includes(question.correct);
  if (question.type === QUESTION_TYPES.TRUE_FALSE) {
    const keys = (question.statements || []).map((s) => s.key);
    return keys.length > 0 && keys.every((k) => typeof (question.correct || {})[k] === "boolean");
  }
  return String(question.correct ?? "").trim() !== "";
}

export function convertQuestionType(question, newType) {
  const q = { ...question };
  if (q.type === newType) return q;

  if (newType === QUESTION_TYPES.MCQ) {
    const sourceTexts = q.type === QUESTION_TYPES.TRUE_FALSE ? (q.statements || []).map((s) => s.text) : [];
    q.options = MCQ_LETTERS.map((_, i) => sourceTexts[i] || "");
    q.statements = [];
    q.correct = null;
  } else if (newType === QUESTION_TYPES.TRUE_FALSE) {
    const sourceTexts = q.type === QUESTION_TYPES.MCQ ? q.options || [] : [];
    q.statements = TF_STATEMENT_KEYS.map((key, i) => ({ key, text: sourceTexts[i] || "" }));
    q.options = [];
    q.correct = {};
  } else {
    q.options = [];
    q.statements = [];
    q.correct = "";
  }
  q.type = newType;
  q.part = PART_BY_TYPE[newType];
  q.points = DEFAULT_POINTS[newType];
  return q;
}

export function createBlankQuestion(type, number) {
  return normalizeQuestionSchema(
    {
      type,
      number,
      text: "",
      options: type === QUESTION_TYPES.MCQ ? ["", "", "", ""] : [],
      statements: type === QUESTION_TYPES.TRUE_FALSE ? TF_STATEMENT_KEYS.map((key) => ({ key, text: "" })) : [],
      correct: type === QUESTION_TYPES.TRUE_FALSE ? {} : ""
    },
    number - 1
  );
}

/* ==========================================================================
   5. BỘ BÓC TÁCH ĐỀ THI LINH HOẠT 3 PHẦN (FLEXIBLE QUESTION PARSER)
   ========================================================================== */
const PART_HEADER_REGEX = /^(?:PHẦN|Phần|PART|Part)\s+(IV|III|II|I|[1-4])(?![A-Za-z])\s*[.:\-)]?\s*(.*)$/u;
const QUESTION_START_REGEX =
  /^(?:Câu|CÂU|Bài|BÀI|Question|QUESTION)\s*(\d{1,3})\s*(?:\(([^)]{1,15})\))?\s*[:.\-)]?\s*(.*)$/u;
const NUMERIC_START_REGEX = /^(\d{1,3})\s*[.)]\s+(\S.*)$/u;
// Bắt buộc có dấu ":" hoặc "=" để không nhận nhầm đề bài kiểu "Đáp án nào sau đây đúng?"
const ANSWER_LINE_REGEX = /^(?:Đáp\s*án(?:\s*đúng)?|ĐA|Answer|Key)\s*[:=]\s*(.+)$/iu;
const ANSWER_LETTER_ONLY_REGEX = /^(?:Đáp\s*án(?:\s*đúng)?|ĐA)\s+([A-D])\.?$/iu;
const CHOOSE_LINE_REGEX = /^Chọn\s+(?:đáp\s*án\s+|phương\s*án\s+)?([A-D])(?![A-Za-zÀ-ỹ])/u;
// Từ khóa lời giải phải đứng một mình hoặc đi kèm dấu ":" "." "-" để không nhận nhầm câu "Giải thích vì sao..."
const EXPLANATION_LINE_REGEX =
  /^(?:Giải\s*thích|Lời\s*giải(?:\s*chi\s*tiết)?|Hướng\s*dẫn(?:\s*giải)?|HDG|HD)\s*(?:[:=\-.]\s*(.*)|$)/iu;
const INLINE_EXPLANATION_SPLIT_REGEX =
  /\s*[-|]?\s*(?:Giải\s*thích|Lời\s*giải|Hướng\s*dẫn)\s*[:=\-]?\s*|\s*[-|]?\s*HD\s*[:=]\s*|\s+[-|]\s*(?=Vì\s)/iu;
const ANSWER_SECTION_HEADING_REGEX =
  /^(?:BẢNG\s+)?(?:ĐÁP\s*ÁN|HƯỚNG\s*DẪN\s*GIẢI|LỜI\s*GIẢI\s*CHI\s*TIẾT)(?:\s+(?:VÀ|&)\s+[^\n:]{0,40})?(?:\s+(?:ĐỀ|THAM\s*KHẢO)[^\n:]{0,40})?\s*[:.]?\s*$/u;

function romanOrDigitToPart(token) {
  const map = { I: 1, II: 2, III: 3, IV: 4, 1: 1, 2: 2, 3: 3, 4: 4 };
  return map[String(token).toUpperCase()] || null;
}

function detectPartFromLine(line) {
  const headerMatch = line.match(PART_HEADER_REGEX);
  if (headerMatch) {
    const part = romanOrDigitToPart(headerMatch[1]);
    if (part && part <= 3) return part;
    const lower = line.toLowerCase();
    if (lower.includes("đúng sai") || lower.includes("đúng/sai") || lower.includes("đúng - sai")) return 2;
    if (lower.includes("trả lời ngắn")) return 3;
    if (lower.includes("nhiều phương án")) return 1;
    return part && part <= 3 ? part : null;
  }
  return null;
}

/**
 * Tìm các mốc phương án theo đúng thứ tự (A -> B -> C -> D hoặc a -> b -> c -> d) trên 1 dòng.
 * startIndex cho biết phương án kế tiếp đang chờ (ví dụ đã có A thì chờ B).
 */
function findOrderedMarkers(line, uppercase, startIndex) {
  const letters = uppercase ? MCQ_LETTERS : TF_STATEMENT_KEYS;
  const regex = uppercase
    ? /(^|[\s(])(\*)?([A-D])(\*)?\s*[.):]\s*/gu
    : /(^|[\s(])(\*)?([a-d])(\*)?\s*[.):]\s*/gu;

  const candidates = [];
  let match;
  while ((match = regex.exec(line)) !== null) {
    const letterStart = match.index + match[1].length;
    candidates.push({
      letter: match[3],
      start: letterStart,
      end: regex.lastIndex,
      starred: Boolean(match[2] || match[4])
    });
    if (regex.lastIndex === match.index) regex.lastIndex++;
  }

  const selected = [];
  let expected = startIndex;
  for (const candidate of candidates) {
    if (expected >= letters.length) break;
    if (candidate.letter === letters[expected]) {
      if (selected.length > 0 && candidate.start < selected[selected.length - 1].end) continue;
      selected.push(candidate);
      expected++;
    }
  }
  if (selected.length === 0) return null;

  const startsAtLineBeginning = selected[0].start === 0;
  if (!startsAtLineBeginning && selected.length < 2) return null;

  const head = line.slice(0, selected[0].start).trim();
  const parts = selected.map((marker, i) => {
    const textEnd = i + 1 < selected.length ? selected[i + 1].start : line.length;
    let text = line.slice(marker.end, textEnd).trim();
    let starred = marker.starred;
    if (text.endsWith("*")) {
      starred = true;
      text = text.replace(/\*+$/, "").trim();
    }
    return { letter: marker.letter, text, starred };
  });

  return { head, parts };
}

function createDraftQuestion(number, level, part) {
  return {
    number,
    level: level || "",
    sectionPart: part,
    stem: "",
    options: {},
    statements: {},
    rawAnswer: "",
    starredOption: null,
    explanation: "",
    lastTarget: "stem"
  };
}

function appendToDraft(draft, text) {
  if (!text) return;
  const target = draft.lastTarget;
  if (target === "explanation") {
    draft.explanation = draft.explanation ? `${draft.explanation} ${text}` : text;
  } else if (target.startsWith("opt:")) {
    const letter = target.slice(4);
    draft.options[letter] = draft.options[letter] ? `${draft.options[letter]} ${text}` : text;
  } else if (target.startsWith("st:")) {
    const key = target.slice(3);
    draft.statements[key] = draft.statements[key] ? `${draft.statements[key]} ${text}` : text;
  } else {
    draft.stem = draft.stem ? `${draft.stem} ${text}` : text;
  }
}

function processDraftLine(draft, line) {
  if (!line) return;

  if (draft.lastTarget !== "explanation") {
    const chooseMatch = line.match(CHOOSE_LINE_REGEX);
    if (chooseMatch && Object.keys(draft.options).length > 0) {
      draft.rawAnswer = chooseMatch[1];
      draft.lastTarget = "explanation";
      return;
    }

    const letterOnlyMatch = line.match(ANSWER_LETTER_ONLY_REGEX);
    if (letterOnlyMatch) {
      draft.rawAnswer = letterOnlyMatch[1];
      return;
    }

    const answerMatch = line.match(ANSWER_LINE_REGEX);
    if (answerMatch) {
      const value = answerMatch[1];
      const explainSplit = value.split(INLINE_EXPLANATION_SPLIT_REGEX);
      draft.rawAnswer = explainSplit[0].replace(/[\s\-|]+$/, "").trim();
      if (explainSplit.length > 1) {
        draft.explanation = explainSplit.slice(1).join(" ").trim();
        draft.lastTarget = "explanation";
      }
      return;
    }
  }

  const explainMatch = line.match(EXPLANATION_LINE_REGEX);
  if (explainMatch) {
    draft.lastTarget = "explanation";
    if (explainMatch[1]) {
      draft.explanation = draft.explanation ? `${draft.explanation} ${explainMatch[1]}` : explainMatch[1];
    }
    return;
  }

  if (draft.lastTarget === "explanation") {
    const chooseInExplain = line.match(CHOOSE_LINE_REGEX);
    if (chooseInExplain && !draft.rawAnswer) draft.rawAnswer = chooseInExplain[1];
    appendToDraft(draft, line);
    return;
  }

  // Phương án A, B, C, D (Phần I)
  const nextOptionIndex = Object.keys(draft.options).length;
  if (Object.keys(draft.statements).length === 0 && nextOptionIndex < 4) {
    const upperMarkers = findOrderedMarkers(line, true, nextOptionIndex);
    if (upperMarkers) {
      if (upperMarkers.head) appendToDraft(draft, upperMarkers.head);
      upperMarkers.parts.forEach((part) => {
        draft.options[part.letter] = part.text;
        if (part.starred) draft.starredOption = part.letter;
        draft.lastTarget = `opt:${part.letter}`;
      });
      return;
    }
  }

  // Mệnh đề a), b), c), d) (Phần II)
  const nextStatementIndex = Object.keys(draft.statements).length;
  if (Object.keys(draft.options).length === 0 && nextStatementIndex < 4) {
    const lowerMarkers = findOrderedMarkers(line, false, nextStatementIndex);
    if (lowerMarkers) {
      if (lowerMarkers.head) appendToDraft(draft, lowerMarkers.head);
      lowerMarkers.parts.forEach((part) => {
        draft.statements[part.letter] = part.text;
        draft.lastTarget = `st:${part.letter}`;
      });
      return;
    }
  }

  appendToDraft(draft, line);
}

function finalizeDraft(draft, index) {
  let optionLetters = Object.keys(draft.options);
  let statementKeys = Object.keys(draft.statements);

  // Gợi ý từ tiêu đề PHẦN: đề Phần II viết hoa A) B) C) D) -> chuyển thành mệnh đề a, b, c, d
  if (draft.sectionPart === 2 && optionLetters.length >= 2 && statementKeys.length === 0) {
    optionLetters.forEach((letter) => {
      draft.statements[letter.toLowerCase()] = draft.options[letter];
    });
    draft.options = {};
    optionLetters = [];
    statementKeys = Object.keys(draft.statements);
  }
  // Đề Phần I viết thường a. b. c. d. -> chuyển thành phương án A, B, C, D
  if (draft.sectionPart === 1 && statementKeys.length >= 2 && optionLetters.length === 0) {
    statementKeys.forEach((key) => {
      draft.options[key.toUpperCase()] = draft.statements[key];
    });
    draft.statements = {};
    statementKeys = [];
    optionLetters = Object.keys(draft.options);
  }

  let type;
  if (optionLetters.length >= 2) type = QUESTION_TYPES.MCQ;
  else if (statementKeys.length >= 2) type = QUESTION_TYPES.TRUE_FALSE;
  else type = QUESTION_TYPES.SHORT_ANSWER;

  // Câu có đúng 1 phương án lẻ (nhận nhầm) -> trả phần chữ về đề bài
  if (type === QUESTION_TYPES.SHORT_ANSWER) {
    optionLetters.forEach((letter) => {
      draft.stem = `${draft.stem} ${letter}. ${draft.options[letter]}`.trim();
    });
    statementKeys.forEach((key) => {
      draft.stem = `${draft.stem} ${key}) ${draft.statements[key]}`.trim();
    });
  }

  let correct;
  if (type === QUESTION_TYPES.MCQ) {
    correct = extractMcqLetter(draft.rawAnswer) || draft.starredOption || null;
  } else if (type === QUESTION_TYPES.TRUE_FALSE) {
    correct = parseTrueFalseAnswer(draft.rawAnswer) || {};
  } else {
    correct = cleanShortAnswerKey(draft.rawAnswer);
  }

  const levelSuffix = draft.level ? ` (${draft.level})` : "";
  const stemText = draft.stem.trim();
  const displayText = `Câu ${draft.number}${levelSuffix}: ${stemText}`.trim();

  return normalizeQuestionSchema(
    {
      type,
      number: draft.number,
      level: draft.level,
      text: displayText,
      options: MCQ_LETTERS.map((letter) => draft.options[letter] || ""),
      statements: TF_STATEMENT_KEYS.map((key) => ({ key, text: draft.statements[key] || "" })),
      correct,
      explanation: draft.explanation
    },
    index
  );
}

function tryParseJsonQuestions(text) {
  const trimmed = String(text ?? "").trim();
  if (!(trimmed.startsWith("[") || trimmed.startsWith("{"))) return null;
  try {
    const data = JSON.parse(trimmed);
    const list = Array.isArray(data) ? data : Array.isArray(data.questions) ? data.questions : null;
    if (!list || list.length === 0) return null;
    return list.map((q, i) => normalizeQuestionSchema(q, i));
  } catch (_) {
    return null;
  }
}

/**
 * Bóc tách văn bản đề thi -> { questions, answerSectionText, stats, warnings }
 * Chỉ ném lỗi khi văn bản trống hoặc không có bất kỳ mốc câu hỏi nào.
 */
export function parseExamDocument(rawText) {
  const jsonQuestions = tryParseJsonQuestions(rawText);
  if (jsonQuestions) {
    return {
      questions: jsonQuestions,
      answerSectionText: "",
      stats: computeExamStats(jsonQuestions),
      warnings: []
    };
  }

  const text = normalizeExamText(rawText);
  if (!text) {
    throw new ExamParseError("File / nội dung đề hoàn toàn trống, không có chữ nào để bóc tách.");
  }

  const lines = text.split("\n");
  const hasKeywordMarkers = lines.some((line) => QUESTION_START_REGEX.test(line));
  const warnings = [];

  let currentPart = null;
  let draft = null;
  let lastNumericNumber = 0;
  const drafts = [];
  let answerSectionStartIndex = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    if (ANSWER_SECTION_HEADING_REGEX.test(line) && drafts.length + (draft ? 1 : 0) > 0) {
      answerSectionStartIndex = i + 1;
      break;
    }

    const part = detectPartFromLine(line);
    if (part) {
      if (draft) {
        drafts.push(draft);
        draft = null;
      }
      currentPart = part;
      lastNumericNumber = 0;
      continue;
    }

    let startMatch = null;
    let number = null;
    let level = "";
    let rest = "";

    if (hasKeywordMarkers) {
      startMatch = line.match(QUESTION_START_REGEX);
      if (startMatch) {
        number = parseInt(startMatch[1], 10);
        level = (startMatch[2] || "").trim();
        rest = (startMatch[3] || "").trim();
      }
    } else {
      startMatch = line.match(NUMERIC_START_REGEX);
      if (startMatch) {
        const candidate = parseInt(startMatch[1], 10);
        const isSequential = candidate === lastNumericNumber + 1 || (candidate === 1 && lastNumericNumber !== 0);
        if (isSequential) {
          number = candidate;
          rest = startMatch[2].trim();
          lastNumericNumber = candidate;
        } else {
          startMatch = null;
        }
      }
    }

    if (startMatch && number !== null) {
      if (draft) drafts.push(draft);
      draft = createDraftQuestion(number, level, currentPart);
      if (rest) processDraftLine(draft, rest);
      continue;
    }

    if (draft) processDraftLine(draft, line);
  }
  if (draft) drafts.push(draft);

  if (drafts.length === 0) {
    throw new ExamParseError(
      'Không tìm thấy bất kỳ mốc câu hỏi nào trong nội dung (ví dụ "Câu 1:", "Câu 1.", "Câu 1 (NB):", "Bài 1:", "1."). Vui lòng kiểm tra lại file đề.'
    );
  }

  const questions = drafts.map((d, i) => finalizeDraft(d, i));

  questions.forEach((q) => {
    if (!q.text.replace(/^Câu\s*\d+(?:\s*\([^)]*\))?:\s*/u, "").trim()) {
      warnings.push(`Câu ${q.number} (Phần ${q.part}) chưa có nội dung đề bài.`);
    }
    if (q.type === QUESTION_TYPES.MCQ) {
      const missing = MCQ_LETTERS.filter((_, i) => !q.options[i]);
      if (missing.length > 0) warnings.push(`Câu ${q.number} (Phần I) thiếu phương án ${missing.join(", ")}.`);
    }
    if (q.type === QUESTION_TYPES.TRUE_FALSE) {
      const missing = q.statements.filter((s) => !s.text).map((s) => s.key);
      if (missing.length > 0) warnings.push(`Câu ${q.number} (Phần II) thiếu mệnh đề ${missing.join(", ")}.`);
    }
  });

  const answerSectionText = answerSectionStartIndex >= 0 ? lines.slice(answerSectionStartIndex).join("\n") : "";

  return {
    questions,
    answerSectionText,
    stats: computeExamStats(questions),
    warnings
  };
}

export function computeExamStats(questions) {
  const stats = { total: 0, part1: 0, part2: 0, part3: 0, missingAnswers: 0, maxScore: 0 };
  (questions || []).forEach((q) => {
    stats.total++;
    if (q.type === QUESTION_TYPES.MCQ) stats.part1++;
    else if (q.type === QUESTION_TYPES.TRUE_FALSE) stats.part2++;
    else stats.part3++;
    if (!hasValidAnswer(q)) stats.missingAnswers++;
    stats.maxScore += toPositiveNumber(q.points, DEFAULT_POINTS[q.type] || 0.25);
  });
  stats.maxScore = roundScore(stats.maxScore, 2);
  return stats;
}

/* ==========================================================================
   6. BỘ BÓC TÁCH FILE ĐÁP ÁN & ĐỐI CHIẾU (ANSWER KEY PARSER + MAPPING)
   ========================================================================== */
function isAnswerLikeValue(value) {
  const v = String(value ?? "").trim();
  if (!v) return false;
  if (/^[A-D]$/.test(v)) return true;
  if (parseTrueFalseAnswer(v)) return true;
  if (/^-?\d+(?:[.,]\d+)?$/.test(v)) return true;
  return v.length <= 12;
}

/**
 * Ghép các bảng đáp án dạng ô (mammoth / PDF tách mỗi ô 1 dòng):
 * - Bảng ngang:  1 / 2 / 3 / ... rồi A / B / C / ...
 * - Bảng dọc:    1 / A / 2 / B / ...
 */
function mergeTabularAnswerLines(lines) {
  const output = [];
  let i = 0;
  const isNumberOnly = (s) => /^\d{1,3}$/.test(String(s ?? "").trim());
  const isLabelLine = (s) => /^(?:Câu|Đáp\s*án|ĐA|Chọn|Key|Answer)\s*[:.]?$/iu.test(String(s ?? "").trim());

  while (i < lines.length) {
    const line = lines[i];
    if (isNumberOnly(line)) {
      let runEnd = i;
      while (runEnd + 1 < lines.length && isNumberOnly(lines[runEnd + 1]) && parseInt(lines[runEnd + 1], 10) === parseInt(lines[runEnd], 10) + 1) {
        runEnd++;
      }
      const runLength = runEnd - i + 1;

      if (runLength >= 2) {
        let valueStart = runEnd + 1;
        while (valueStart < lines.length && isLabelLine(lines[valueStart])) valueStart++;
        const values = lines.slice(valueStart, valueStart + runLength);
        if (values.length === runLength && values.every((v) => isAnswerLikeValue(v) && !isNumberOnly(v))) {
          for (let k = 0; k < runLength; k++) {
            output.push(`${parseInt(lines[i + k], 10)}. ${values[k].trim()}`);
          }
          i = valueStart + runLength;
          continue;
        }
      }

      if (i + 1 < lines.length && isAnswerLikeValue(lines[i + 1]) && !isNumberOnly(lines[i + 1])) {
        output.push(`${parseInt(line, 10)}. ${lines[i + 1].trim()}`);
        i += 2;
        continue;
      }
    }
    output.push(line);
    i++;
  }
  return output;
}

/**
 * Bóc tách File Đáp Án -> { entries: Map("part:number" -> {value, explanation}), hasParts, count }
 * Hỗ trợ:
 *  - "1.A, 2.B, 3.C" | "1-A 2-B" | "Câu 1: A - Giải thích: ..."
 *  - Phần II: "Câu 1: a-Đ, b-S, c-Đ, d-Đ" | "Câu 1: Đ-S-Đ-Đ" | "1. ĐSĐĐ"
 *  - Phần III: "Câu 1: 12,5" | "Câu 2: -3"
 *  - Tiêu đề "PHẦN I / II / III" để đánh số lại theo từng phần
 */
export function parseAnswerKeyDocument(rawText) {
  const text = normalizeExamText(rawText);
  const entries = new Map();
  let hasParts = false;
  let currentPart = 0;
  let lastKey = null;

  if (!text) return { entries, hasParts, count: 0 };

  const rawLines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const lines = mergeTabularAnswerLines(rawLines);

  const setEntry = (number, value, explanation = "") => {
    const key = `${currentPart}:${number}`;
    const cleanValue = String(value ?? "").replace(/[\s\-|,;]+$/, "").trim();
    if (!cleanValue && !explanation) return;
    const existing = entries.get(key);
    entries.set(key, {
      part: currentPart,
      number,
      value: cleanValue || (existing ? existing.value : ""),
      explanation: explanation || (existing ? existing.explanation : "")
    });
    lastKey = key;
  };

  const compactMcqRegex = /(?:^|[\s,;|])(?:Câu\s*)?(\d{1,3})\s*[.:\-)=]?\s*([A-D])(?![A-Za-zÀ-ỹ0-9])/gu;
  const compactTfRegex =
    /(?:^|[\s,;|])(?:Câu\s*)?(\d{1,3})\s*[.:\-)=]\s*((?:(?:Đ|S|đ|s)[\s\-/,]*){4})(?![A-Za-zÀ-ỹ])/gu;
  const detailedRegex = /^(?:Câu|CÂU|câu|Bài|Question)?\s*(\d{1,3})\s*(?:\([^)]{0,15}\))?\s*[:.\-)=]\s*(.*)$/u;
  const detailedWithKeywordRegex = /^(?:Câu|CÂU|câu|Bài|Question)\s*(\d{1,3})\s*(?:\([^)]{0,15}\))?\s*[:.\-)=]?\s*(.*)$/u;

  for (let line of lines) {
    const headerMatch = line.match(PART_HEADER_REGEX);
    if (headerMatch) {
      const part = romanOrDigitToPart(headerMatch[1]);
      if (part && part <= 3) {
        currentPart = part;
        hasParts = true;
        lastKey = null;
        line = (headerMatch[2] || "").trim();
        if (!line) continue;
      }
    }

    const explainOnly = line.match(EXPLANATION_LINE_REGEX);
    if (explainOnly && lastKey && entries.has(lastKey)) {
      const entry = entries.get(lastKey);
      const addition = (explainOnly[1] || "").trim();
      if (addition) entry.explanation = entry.explanation ? `${entry.explanation} ${addition}` : addition;
      continue;
    }

    const mcqMatches = [...line.matchAll(compactMcqRegex)];
    if (mcqMatches.length >= 2) {
      mcqMatches.forEach((m) => setEntry(parseInt(m[1], 10), m[2]));
      continue;
    }

    const tfMatches = [...line.matchAll(compactTfRegex)];
    if (tfMatches.length >= 2) {
      tfMatches.forEach((m) => setEntry(parseInt(m[1], 10), m[2]));
      continue;
    }

    const detailed = line.match(detailedWithKeywordRegex) || line.match(detailedRegex);
    if (detailed) {
      const number = parseInt(detailed[1], 10);
      const rest = (detailed[2] || "").trim();
      const pieces = rest.split(INLINE_EXPLANATION_SPLIT_REGEX);
      let value = (pieces[0] || "").trim();
      const explanation = pieces.length > 1 ? pieces.slice(1).join(" ").trim() : "";

      const chooseMatch = value.match(/^Chọn\s+(?:đáp\s*án\s+)?([A-D])(?![A-Za-zÀ-ỹ])/u);
      if (chooseMatch) value = chooseMatch[1];

      // "Câu 1: A. 1.400 km - Giải thích ..." -> giữ chữ cái đầu khi phía sau là nội dung phương án
      const letterWithText = value.match(/^([A-D])\s*[.)]\s+\S/u);
      if (letterWithText) value = letterWithText[1];

      if (value || explanation) {
        setEntry(number, value, explanation);
        continue;
      }
    }

    if (lastKey && entries.has(lastKey)) {
      const entry = entries.get(lastKey);
      if (entry.explanation) {
        entry.explanation = `${entry.explanation} ${line}`;
      } else if (!entry.value) {
        entry.value = line;
      }
    }
  }

  return { entries, hasParts, count: entries.size };
}

export function interpretAnswerValueForQuestion(question, value) {
  if (value === undefined || value === null || String(value).trim() === "") return null;
  if (question.type === QUESTION_TYPES.MCQ) {
    return extractMcqLetter(value);
  }
  if (question.type === QUESTION_TYPES.TRUE_FALSE) {
    const parsed = parseTrueFalseAnswer(value);
    if (!parsed) return null;
    const allowedKeys = (question.statements || []).map((s) => s.key);
    const filtered = {};
    Object.keys(parsed).forEach((key) => {
      if (allowedKeys.includes(key)) filtered[key] = parsed[key];
    });
    return Object.keys(filtered).length > 0 ? filtered : null;
  }
  const cleaned = cleanShortAnswerKey(value);
  if (!cleaned) return null;
  // Không nhận nhầm chuỗi Đúng/Sai hoặc chữ cái A-D đơn lẻ làm đáp án Trả lời ngắn
  if (/^[A-D]$/.test(cleaned) || /^(?:[ĐS][\s\-/,]*){4}$/u.test(cleaned)) return null;
  return cleaned;
}

/**
 * Đối chiếu đáp án vào danh sách câu hỏi theo thứ tự ưu tiên:
 *  1. Phần + Số câu gốc    2. Phần + Thứ tự trong phần
 *  3. Số câu gốc (không phân phần)    4. Số thứ tự toàn đề
 */
export function applyAnswerKeyToQuestions(questions, answerKey) {
  const result = { applied: 0, total: questions.length, unmatched: [] };
  if (!answerKey || !answerKey.entries || answerKey.entries.size === 0) return result;

  const partCounters = { 1: 0, 2: 0, 3: 0 };

  questions.forEach((question, globalIndex) => {
    partCounters[question.part] = (partCounters[question.part] || 0) + 1;
    const partOrdinal = partCounters[question.part];

    const candidateKeys = [
      `${question.part}:${question.number}`,
      `${question.part}:${partOrdinal}`,
      `0:${question.number}`,
      `0:${globalIndex + 1}`
    ];

    let applied = false;
    for (const key of candidateKeys) {
      const entry = answerKey.entries.get(key);
      if (!entry) continue;
      const interpreted = interpretAnswerValueForQuestion(question, entry.value);
      if (interpreted === null && !entry.explanation) continue;

      if (interpreted !== null) {
        if (question.type === QUESTION_TYPES.TRUE_FALSE) {
          question.correct = { ...(question.correct || {}), ...interpreted };
        } else {
          question.correct = interpreted;
        }
      }
      if (entry.explanation) question.explanation = entry.explanation;
      if (interpreted !== null) {
        applied = true;
        break;
      }
    }

    if (applied) result.applied++;
    else result.unmatched.push(`Câu ${question.number} (Phần ${question.part})`);
  });

  return result;
}

/* ==========================================================================
   7. BỘ CHẤM ĐIỂM CHUẨN BỘ GD&ĐT (GRADING ENGINE)
   ========================================================================== */
export function normalizeShortAnswerValue(value) {
  return String(value ?? "")
    .normalize("NFC")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[\u2212\u2013\u2014]/g, "-")
    .replace(/^\+/, "")
    .replace(/(\d)\.$/, "$1")
    .replace(/,/g, ".");
}

/**
 * So khớp Trả lời ngắn: bỏ khoảng trắng, chấp nhận cả dấu "," và "." cho số thập phân,
 * so sánh theo giá trị số (12,5 = 12.5 = 12.50). Đáp án gốc có thể chứa nhiều giá trị được chấp nhận ("12,5 | 12.5" hoặc "a; b").
 */
export function isShortAnswerCorrect(studentValue, keyValue) {
  const student = normalizeShortAnswerValue(studentValue);
  if (!student) return false;

  const acceptedKeys = String(keyValue ?? "")
    .split(/\s*(?:\||;|\bhoặc\b|\bor\b)\s*/iu)
    .map((k) => normalizeShortAnswerValue(k))
    .filter(Boolean);

  return acceptedKeys.some((key) => {
    if (key === student) return true;
    const numericPattern = /^-?(?:\d+(?:\.\d+)?|\.\d+)$/;
    if (numericPattern.test(key) && numericPattern.test(student)) {
      return Math.abs(Number(key) - Number(student)) < 1e-9;
    }
    return false;
  });
}

export function gradeTrueFalseQuestion(question, studentAnswer) {
  const statements = question.statements || [];
  const answers = studentAnswer && typeof studentAnswer === "object" ? studentAnswer : {};
  const maxPoints = toPositiveNumber(question.points, DEFAULT_POINTS.true_false);
  const details = statements.map((s) => {
    const expected = (question.correct || {})[s.key];
    const given = answers[s.key];
    const isCorrect = typeof expected === "boolean" && typeof given === "boolean" && expected === given;
    return { key: s.key, expected, given, isCorrect };
  });

  const correctCount = details.filter((d) => d.isCorrect).length;
  const totalStatements = statements.length || 4;
  let ratio;
  if (correctCount === totalStatements) ratio = 1;
  else if (totalStatements === 4) ratio = TRUE_FALSE_PROGRESSIVE_TABLE[correctCount] || 0;
  else ratio = Math.min(TRUE_FALSE_PROGRESSIVE_TABLE[correctCount] || 0, 0.5);

  const breakdown = {};
  details.forEach((d) => {
    breakdown[d.key] = {
      studentChoice: d.given,
      standardAnswer: d.expected,
      isCorrect: d.isCorrect
    };
  });

  return {
    earned: roundScore(ratio * maxPoints, 4),
    pointsAwarded: roundScore(ratio * maxPoints, 4),
    maxPoints,
    correctCount,
    correctSubCount: correctCount,
    totalStatements,
    isFullyCorrect: correctCount === totalStatements,
    details,
    breakdown
  };
}

export function gradeQuestion(question, studentAnswer) {
  const maxPoints = toPositiveNumber(question.points, DEFAULT_POINTS[question.type] || 0.25);

  if (question.type === QUESTION_TYPES.TRUE_FALSE) {
    const tf = gradeTrueFalseQuestion(question, studentAnswer);
    return { ...tf, type: question.type, isCorrect: tf.isFullyCorrect, answered: tf.details.some((d) => typeof d.given === "boolean") };
  }

  if (question.type === QUESTION_TYPES.SHORT_ANSWER) {
    const answered = String(studentAnswer ?? "").trim() !== "";
    const isCorrect = answered && isShortAnswerCorrect(studentAnswer, question.correct);
    return { type: question.type, earned: isCorrect ? maxPoints : 0, maxPoints, isCorrect, answered };
  }

  const given = String(studentAnswer ?? "").trim().toUpperCase().charAt(0);
  const isCorrect = Boolean(given) && given === question.correct;
  return { type: question.type, earned: isCorrect ? maxPoints : 0, maxPoints, isCorrect, answered: Boolean(given), given };
}

/**
 * Chấm toàn bộ bài thi -> điểm thô, điểm tối đa, điểm quy đổi thang 10 và thống kê theo từng phần.
 */
export function gradeExam(questions, answersByQuestionId) {
  const perQuestion = [];
  const byPart = {
    1: { earned: 0, max: 0, correct: 0, total: 0 },
    2: { earned: 0, max: 0, correct: 0, total: 0 },
    3: { earned: 0, max: 0, correct: 0, total: 0 }
  };
  let rawScore = 0;
  let maxScore = 0;
  let fullyCorrectCount = 0;

  questions.forEach((question) => {
    const studentAns = answersByQuestionId ? answersByQuestionId[question.id] : undefined;
    const graded = gradeQuestion(question, studentAns);
    perQuestion.push({
      question,
      questionId: question.id,
      studentAnswer: studentAns,
      pointsAwarded: graded.earned,
      maxPoints: graded.maxPoints,
      isFullyCorrect: graded.isCorrect,
      subDetails: graded,
      ...graded
    });
    rawScore += graded.earned;
    maxScore += graded.maxPoints;
    if (graded.isCorrect) fullyCorrectCount++;
    const bucket = byPart[question.part] || byPart[1];
    bucket.earned += graded.earned;
    bucket.max += graded.maxPoints;
    bucket.total++;
    if (graded.isCorrect) bucket.correct++;
  });

  Object.values(byPart).forEach((bucket) => {
    bucket.earned = roundScore(bucket.earned, 2);
    bucket.max = roundScore(bucket.max, 2);
    bucket.rawScore = bucket.earned;
    bucket.maxScore = bucket.max;
  });

  const scaledScore = maxScore > 0 ? roundScore((rawScore / maxScore) * 10, 2) : 0;

  return {
    perQuestion,
    byPart,
    rawScore: roundScore(rawScore, 2),
    maxScore: roundScore(maxScore, 2),
    scaledScore,
    fullyCorrectCount,
    totalQuestions: questions.length
  };
}

/* ==========================================================================
   8. HỖ TRỢ HIỂN THỊ & CHATBOT
   ========================================================================== */
export function describeCorrectAnswer(question) {
  if (!question) return "Chưa có đáp án";
  if (question.type === QUESTION_TYPES.TRUE_FALSE) {
    const parts = (question.statements || []).map((s) => {
      const value = (question.correct || {})[s.key];
      const label = value === true ? "Đúng" : value === false ? "Sai" : "Chưa có";
      return `${s.key}) ${label}`;
    });
    return parts.length > 0 ? parts.join(", ") : "Chưa có đáp án";
  }
  if (question.type === QUESTION_TYPES.SHORT_ANSWER) {
    return String(question.correct ?? "").trim() || "Chưa có đáp án";
  }
  const index = MCQ_LETTERS.indexOf(question.correct);
  if (index < 0) return "Chưa có đáp án";
  return formatOptionLabel(question.correct, (question.options || [])[index] || "");
}

export function questionSearchText(question) {
  if (!question) return "";
  const options = (question.options || []).map((o, i) => formatOptionLabel(MCQ_LETTERS[i], o)).join(" ");
  const statements = (question.statements || []).map((s) => `${s.key}) ${s.text}`).join(" ");
  return `${question.text || ""} ${options} ${statements}`.trim();
}

export function buildSampleExamText() {
  return `PHẦN I. Câu trắc nghiệm nhiều phương án lựa chọn. Thí sinh trả lời từ câu 1 đến câu 3. Mỗi câu hỏi thí sinh chỉ chọn một phương án.
Câu 1 (NB): Nước ta nằm hoàn toàn trong vùng nội chí tuyến bán cầu Bắc nên có đặc điểm khí hậu nào?
A. Nhiệt đới ẩm gió mùa, tổng bức xạ lớn.
B. Ôn đới hải dương mát mẻ quanh năm.
C. Hàn đới lạnh giá.
D. Cận nhiệt đới khô hạn.
Câu 2 (NB): Đường biên giới trên đất liền giữa Việt Nam và Lào dài khoảng A. 1.400 km. B. 1.100 km. C. 2.100 km. D. 3.260 km.
Câu 3 (TH): Vùng nào có diện tích trồng cây công nghiệp lâu năm lớn nhất nước ta?
A) Tây Nguyên và Đông Nam Bộ.   B) Đồng bằng sông Hồng.
C) Bắc Trung Bộ.   D) Duyên hải Nam Trung Bộ.

PHẦN II. Câu trắc nghiệm đúng sai. Thí sinh trả lời từ câu 1 đến câu 2. Trong mỗi ý a), b), c), d) ở mỗi câu, thí sinh chọn đúng hoặc sai.
Câu 1: Cho hàm số y = x³ - 3x + 2.
a) Hàm số đồng biến trên khoảng (1; +∞).
b) Hàm số đạt cực đại tại x = 1.
c) Giá trị cực tiểu của hàm số bằng 0.
d) Đồ thị hàm số cắt trục tung tại điểm có tung độ bằng 2.
Câu 2: Về vị trí địa lí và phạm vi lãnh thổ Việt Nam:
a. Việt Nam nằm ở rìa phía đông của bán đảo Đông Dương.
b. Đường bờ biển nước ta dài khoảng 2.100 km.
c. Nước ta có chung biên giới trên đất liền với Trung Quốc, Lào và Campuchia.
d. Lãnh thổ nước ta nằm hoàn toàn ở bán cầu Nam.

PHẦN III. Câu trắc nghiệm trả lời ngắn. Thí sinh trả lời từ câu 1 đến câu 2.
Câu 1: Tính giá trị của biểu thức P = log₂8 + 9,5.
Câu 2: Một vật chuyển động thẳng với vận tốc v(t) = 3t² (m/s). Tính quãng đường vật đi được trong 2 giây đầu (đơn vị: mét).`;
}

export function buildSampleAnswerKeyText() {
  return `PHẦN I
1.A  2.C  3.A
Câu 1: A - Giải thích: Vị trí nội chí tuyến bán cầu Bắc kết hợp gió mùa tạo nên khí hậu nhiệt đới ẩm gió mùa.
Câu 2: C - Giải thích: Theo SGK Địa lí 12, đường biên giới trên đất liền giữa Việt Nam và Lào dài khoảng 2.100 km.
Câu 3: A - Giải thích: Tây Nguyên và Đông Nam Bộ có diện tích đất đỏ badan và đất xám lớn nhất cả nước.

PHẦN II
Câu 1: a-Đ, b-S, c-Đ, d-Đ - Giải thích: y' = 3x² - 3, hàm số đạt cực đại tại x = -1, cực tiểu tại x = 1 với y(1) = 0.
Câu 2: Đ-S-Đ-S - Giải thích: Bờ biển nước ta dài khoảng 3.260 km và lãnh thổ nằm ở bán cầu Bắc.

PHẦN III
Câu 1: 12,5 - Giải thích: log₂8 = 3 nên P = 3 + 9,5 = 12,5.
Câu 2: 8 - Giải thích: Quãng đường S = ∫₀² 3t² dt = t³ |₀² = 8 (m).`;
}
