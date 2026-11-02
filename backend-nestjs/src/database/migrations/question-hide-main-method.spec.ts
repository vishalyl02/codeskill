import { applyQuestionHideMainMethodMigration } from './question-hide-main-method';

it('adds the hideMainMethod boolean column with default false to questions table', async () => {
  const query = jest.fn().mockResolvedValue(undefined);

  await applyQuestionHideMainMethodMigration({ query });

  expect(query).toHaveBeenCalledWith(
    'ALTER TABLE "questions" ADD COLUMN IF NOT EXISTS "hideMainMethod" boolean NOT NULL DEFAULT false;',
  );
});
