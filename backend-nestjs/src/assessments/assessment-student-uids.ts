import { BadRequestException } from '@nestjs/common';
import { extname } from 'node:path';
import * as XLSX from 'xlsx';

const MAX_UID_ROWS = 1_000;

export function parseAssessmentStudentUids(file: Express.Multer.File) {
  const extension = extname(file?.originalname || '').toLowerCase();
  if (!file?.buffer?.length || !['.csv', '.xlsx'].includes(extension)) {
    throw new BadRequestException('Choose a CSV or XLSX file with a single UID column.');
  }

  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(file.buffer, { type: 'buffer', raw: true, sheetRows: MAX_UID_ROWS + 2 });
  } catch {
    throw new BadRequestException('The spreadsheet could not be read. Save it as XLSX or UTF-8 CSV and try again.');
  }

  const uniqueUids = new Map<string, string>();
  let totalRows = 0;
  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name];
    const reference = sheet?.['!ref'];
    if (!reference) continue;
    if (XLSX.utils.decode_range(reference).e.c !== 0) {
      throw new BadRequestException('The spreadsheet must contain one column named UID.');
    }
    const fullRange = XLSX.utils.decode_range(sheet['!fullref'] || reference);
    const rows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, raw: false, blankrows: false });
    if (!rows.length) continue;
    if (rows[0][0]?.trim().toLowerCase() !== 'uid') {
      throw new BadRequestException('The first row of each sheet must contain the UID header.');
    }
    if (fullRange.e.r - fullRange.s.r > MAX_UID_ROWS) {
      throw new BadRequestException(`Upload up to ${MAX_UID_ROWS.toLocaleString('en-US')} UID rows at a time.`);
    }

    for (const [value] of rows.slice(1)) {
      const uid = value?.trim();
      if (!uid) continue;
      totalRows++;
      const key = uid.toLowerCase();
      if (!uniqueUids.has(key)) uniqueUids.set(key, uid);
    }
  }
  if (totalRows > MAX_UID_ROWS) {
    throw new BadRequestException(`Upload up to ${MAX_UID_ROWS.toLocaleString('en-US')} UID rows at a time.`);
  }
  if (!totalRows) throw new BadRequestException('Add at least one UID below the header.');

  return { uniqueUids, duplicateCount: totalRows - uniqueUids.size };
}
