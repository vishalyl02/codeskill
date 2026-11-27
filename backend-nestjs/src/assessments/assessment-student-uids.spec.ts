import * as XLSX from 'xlsx';
import { parseAssessmentStudentUids } from './assessment-student-uids';

const upload = (originalname: string, contents: string | Buffer) => ({
  originalname,
  buffer: typeof contents === 'string' ? Buffer.from(contents) : contents,
}) as Express.Multer.File;

describe('Assessment student UID file', () => {
  it('reads CSV UIDs literally and counts case-insensitive duplicates', () => {
    const data = parseAssessmentStudentUids(upload('uids.csv', '\ufeffUID\n00017\n  CS001  \ncs001\n\n'));
    expect([...data.uniqueUids]).toEqual([['00017', '00017'], ['cs001', 'CS001']]);
    expect(data.duplicateCount).toBe(1);
  });

  it('reads UIDs from an Excel workbook', () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['UID'], ['00017']]), 'Students');
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
    expect([...parseAssessmentStudentUids(upload('uids.xlsx', buffer)).uniqueUids.keys()]).toEqual(['00017']);
  });

  it.each([
    ['UID,Email\nCS001,alice@example.invalid', 'one column named UID'],
    ['Email\nalice@example.invalid', 'UID header'],
    ['UID\n\n', 'at least one UID'],
  ])('rejects invalid CSV structure %j', (contents, error) => {
    expect(() => parseAssessmentStudentUids(upload('uids.csv', contents))).toThrow(error);
  });
});
