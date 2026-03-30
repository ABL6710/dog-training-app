// @ts-check
const { test, expect } = require('@playwright/test');

const BASE_URL = 'http://localhost:8080';

// Helper: clear localStorage before each test
test.beforeEach(async ({ page }) => {
  await page.goto(BASE_URL);
  await page.evaluate(() => localStorage.clear());
  await page.goto(BASE_URL);
});

// ============================================
// 1. BASIC RENDERING & NAVIGATION
// ============================================

test.describe('Basic Rendering', () => {
  test('should render the home page with correct Hebrew title', async ({ page }) => {
    await expect(page.locator('header h1')).toContainText('ניהול אילוף');
    await expect(page).toHaveTitle('ניהול לקוחות אילוף');
  });

  test('should show empty state when no clients exist', async ({ page }) => {
    await expect(page.locator('.empty-state')).toBeVisible();
    await expect(page.locator('.empty-state')).toContainText('אין לקוחות עדיין');
  });

  test('should have RTL direction on body', async ({ page }) => {
    const dir = await page.locator('html').getAttribute('dir');
    expect(dir).toBe('rtl');
  });

  test('should have working navigation links', async ({ page }) => {
    await page.click('text=+ לקוח חדש');
    await expect(page.locator('h2')).toContainText('לקוח חדש');

    await page.click('text=לקוחות');
    await expect(page.locator('h2')).toContainText('הלקוחות שלי');
  });

  test('should navigate to home when clicking logo', async ({ page }) => {
    await page.click('text=+ לקוח חדש');
    await page.click('header h1 a');
    await expect(page.locator('h2')).toContainText('הלקוחות שלי');
  });
});

// ============================================
// 2. CLIENT CRUD OPERATIONS
// ============================================

test.describe('Client Management', () => {
  test('should add a new client with all fields', async ({ page }) => {
    await page.click('text=+ לקוח חדש');

    // Fill owner details
    await page.fill('#name', 'דני כהן');
    await page.fill('#phone', '050-1234567');
    await page.fill('#address', 'תל אביב, רחוב דיזנגוף 100');
    await page.fill('#notes', 'לקוח מגיע מהמלצה של ירון');

    // Fill dog details
    await page.fill('#dog_name', 'רקס');
    await page.fill('#dog_breed', 'רועה גרמני');
    await page.fill('#dog_age', '3 שנים');
    await page.fill('#dog_weight', '30 ק״ג');
    await page.fill('#dog_issues', 'משיכה ברצועה\nקפיצה על אנשים\nנביחות על כלבים');

    // Submit
    await page.click('button:has-text("הוסף לקוח")');

    // Verify redirect to client page
    await expect(page.locator('h2')).toContainText('דני כהן – רקס');

    // Verify flash message
    await expect(page.locator('#flash')).toContainText('הלקוח נוסף בהצלחה');

    // Verify all details are shown
    await expect(page.locator('.detail-card').first()).toContainText('דני כהן');
    await expect(page.locator('.detail-card').first()).toContainText('050-1234567');
    await expect(page.locator('.detail-card').first()).toContainText('תל אביב');
    await expect(page.locator('.detail-card').nth(1)).toContainText('רקס');
    await expect(page.locator('.detail-card').nth(1)).toContainText('רועה גרמני');
    await expect(page.locator('.detail-card').nth(1)).toContainText('3 שנים');
    await expect(page.locator('.detail-card').nth(1)).toContainText('30 ק״ג');
    await expect(page.locator('.detail-card').nth(1)).toContainText('משיכה ברצועה');
  });

  test('should require name and dog name fields', async ({ page }) => {
    await page.click('text=+ לקוח חדש');

    // Try to submit empty form
    await page.click('button:has-text("הוסף לקוח")');

    // Should still be on form page (HTML validation prevents submit)
    await expect(page.locator('h2')).toContainText('לקוח חדש');
  });

  test('should add a client with minimal fields (only required)', async ({ page }) => {
    await page.click('text=+ לקוח חדש');
    await page.fill('#name', 'שרה לוי');
    await page.fill('#dog_name', 'לולה');
    await page.click('button:has-text("הוסף לקוח")');

    await expect(page.locator('h2')).toContainText('שרה לוי – לולה');
  });

  test('should edit an existing client', async ({ page }) => {
    // First add a client
    await addTestClient(page, 'דני כהן', 'רקס');

    // Click edit
    await page.click('text=עריכה');
    await expect(page.locator('h2')).toContainText('עריכת לקוח');

    // Verify fields are pre-filled
    await expect(page.locator('#name')).toHaveValue('דני כהן');
    await expect(page.locator('#dog_name')).toHaveValue('רקס');

    // Change name
    await page.fill('#name', 'דני כהן-לוי');
    await page.fill('#dog_breed', 'לברדור');
    await page.click('button:has-text("שמור שינויים")');

    // Verify update
    await expect(page.locator('h2')).toContainText('דני כהן-לוי – רקס');
    await expect(page.locator('.detail-card').nth(1)).toContainText('לברדור');
    await expect(page.locator('#flash')).toContainText('הלקוח עודכן בהצלחה');
  });

  test('should delete a client', async ({ page }) => {
    await addTestClient(page, 'דני כהן', 'רקס');

    // Setup dialog handler before clicking delete
    page.on('dialog', dialog => dialog.accept());
    await page.click('button:has-text("מחיקה")');

    // Should redirect to home with flash
    await expect(page.locator('h2')).toContainText('הלקוחות שלי');
    await expect(page.locator('#flash')).toContainText('הלקוח נמחק');
    await expect(page.locator('.empty-state')).toBeVisible();
  });

  test('should cancel delete when dialog is dismissed', async ({ page }) => {
    await addTestClient(page, 'דני כהן', 'רקס');

    page.on('dialog', dialog => dialog.dismiss());
    await page.click('button:has-text("מחיקה")');

    // Should still be on client page
    await expect(page.locator('h2')).toContainText('דני כהן – רקס');
  });

  test('should show client in home page list', async ({ page }) => {
    await addTestClient(page, 'דני כהן', 'רקס', 'רועה גרמני');

    // Navigate to home
    await page.click('text=לקוחות');

    // Verify client appears in list
    await expect(page.locator('.client-card')).toHaveCount(1);
    await expect(page.locator('.client-info h3')).toContainText('דני כהן');
    await expect(page.locator('.dog-name')).toContainText('רקס');
    await expect(page.locator('.client-badge')).toContainText('0 פגישות');
  });

  test('should display multiple clients', async ({ page }) => {
    await addTestClient(page, 'דני כהן', 'רקס');
    await page.click('text=+ לקוח חדש');
    await addTestClientFromForm(page, 'שרה לוי', 'לולה');
    await page.click('text=+ לקוח חדש');
    await addTestClientFromForm(page, 'יוסי אברהם', 'בוני');

    await page.click('text=לקוחות');

    await expect(page.locator('.client-card')).toHaveCount(3);
  });
});

// ============================================
// 3. SEARCH FUNCTIONALITY
// ============================================

test.describe('Search', () => {
  test('should search by owner name', async ({ page }) => {
    await addTestClient(page, 'דני כהן', 'רקס');
    await page.click('text=+ לקוח חדש');
    await addTestClientFromForm(page, 'שרה לוי', 'לולה');

    await page.click('text=לקוחות');
    await page.fill('#search-input', 'דני');

    await expect(page.locator('.client-card')).toHaveCount(1);
    await expect(page.locator('.client-info h3')).toContainText('דני כהן');
  });

  test('should search by dog name', async ({ page }) => {
    await addTestClient(page, 'דני כהן', 'רקס');
    await page.click('text=+ לקוח חדש');
    await addTestClientFromForm(page, 'שרה לוי', 'לולה');

    await page.click('text=לקוחות');
    await page.fill('#search-input', 'לולה');

    await expect(page.locator('.client-card')).toHaveCount(1);
    await expect(page.locator('.client-info h3')).toContainText('שרה לוי');
  });

  test('should show empty results for non-matching search', async ({ page }) => {
    await addTestClient(page, 'דני כהן', 'רקס');
    await page.click('text=לקוחות');
    await page.fill('#search-input', 'אבגד');

    await expect(page.locator('.empty-state')).toBeVisible();
    await expect(page.locator('.empty-state')).toContainText('לא נמצאו תוצאות');
  });

  test('should be case-insensitive for English names', async ({ page }) => {
    await addTestClient(page, 'Danny Cohen', 'Rex');
    await page.click('text=לקוחות');
    await page.fill('#search-input', 'danny');

    await expect(page.locator('.client-card')).toHaveCount(1);
  });
});

// ============================================
// 4. SESSION MANAGEMENT
// ============================================

test.describe('Session Management', () => {
  test('should add a session with all fields', async ({ page }) => {
    await addTestClient(page, 'דני כהן', 'רקס');

    await page.click('text=+ פגישה חדשה');
    await expect(page.locator('h2')).toContainText('פגישה חדשה – רקס');

    // Fill session details
    await page.fill('#summary', 'עבדנו על הליכה ברצועה רפויה. תרגול שב והישאר.');
    await page.fill('#dog_behavior', 'רקס היה מרוכז ב-15 דקות הראשונות, אחר כך התעייף');
    await page.fill('#homework', 'תרגול הליכה ברצועה 10 דקות ביום');
    await page.fill('#session_notes', 'להביא חטיפים יותר קטנים בפעם הבאה');

    await page.click('button:has-text("שמור פגישה")');

    // Verify redirect to client page
    await expect(page.locator('h2')).toContainText('דני כהן – רקס');
    await expect(page.locator('#flash')).toContainText('הפגישה נוספה בהצלחה');

    // Verify session appears
    await expect(page.locator('.session-card')).toHaveCount(1);
    await expect(page.locator('.session-card')).toContainText('עבדנו על הליכה ברצועה');
    await expect(page.locator('.session-card')).toContainText('רקס היה מרוכז');
    await expect(page.locator('.session-card')).toContainText('תרגול הליכה ברצועה');
    await expect(page.locator('.session-card')).toContainText('להביא חטיפים');
  });

  test('should require summary field', async ({ page }) => {
    await addTestClient(page, 'דני כהן', 'רקס');
    await page.click('text=+ פגישה חדשה');

    // Try to submit without summary
    await page.click('button:has-text("שמור פגישה")');

    // Should still be on session form
    await expect(page.locator('h2')).toContainText('פגישה חדשה');
  });

  test('should default date to today', async ({ page }) => {
    await addTestClient(page, 'דני כהן', 'רקס');
    await page.click('text=+ פגישה חדשה');

    const today = new Date().toISOString().split('T')[0];
    await expect(page.locator('#date')).toHaveValue(today);
  });

  test('should add multiple sessions and sort by date descending', async ({ page }) => {
    await addTestClient(page, 'דני כהן', 'רקס');

    // Add first session (older date)
    await page.click('text=+ פגישה חדשה');
    await page.fill('#date', '2026-03-25');
    await page.fill('#summary', 'פגישה ראשונה');
    await page.click('button:has-text("שמור פגישה")');

    // Add second session (newer date)
    await page.click('text=+ פגישה');
    await page.fill('#date', '2026-03-30');
    await page.fill('#summary', 'פגישה שנייה');
    await page.click('button:has-text("שמור פגישה")');

    // Verify order - newest first
    const sessions = page.locator('.session-card');
    await expect(sessions).toHaveCount(2);
    await expect(sessions.first().locator('.session-date')).toContainText('2026-03-30');
    await expect(sessions.nth(1).locator('.session-date')).toContainText('2026-03-25');
  });

  test('should show session count in client list', async ({ page }) => {
    await addTestClient(page, 'דני כהן', 'רקס');

    // Add two sessions
    await page.click('text=+ פגישה חדשה');
    await page.fill('#summary', 'פגישה 1');
    await page.click('button:has-text("שמור פגישה")');

    await page.click('text=+ פגישה');
    await page.fill('#summary', 'פגישה 2');
    await page.click('button:has-text("שמור פגישה")');

    // Go to home page
    await page.click('text=לקוחות');
    await expect(page.locator('.client-badge')).toContainText('2 פגישות');
  });

  test('should show next session plan in session form', async ({ page }) => {
    await addTestClient(page, 'דני כהן', 'רקס');

    // Set a plan
    await page.click('#plan-section .btn-edit');
    await page.fill('#plan-section textarea', 'לעבוד על ריכוז עם הסחות דעת');
    await page.click('#plan-section button:has-text("שמור")');

    // Open new session form
    await page.click('text=+ פגישה חדשה');

    // Verify plan is shown
    await expect(page.locator('.card')).toContainText('לעבוד על ריכוז עם הסחות דעת');
  });
});

// ============================================
// 5. INLINE EDITING (Notes & Plan)
// ============================================

test.describe('Inline Editing', () => {
  test('should edit notes inline', async ({ page }) => {
    await addTestClient(page, 'דני כהן', 'רקס');

    // Initially shows empty
    await expect(page.locator('#notes-section .content')).toContainText('אין הערות');

    // Click edit
    await page.click('#notes-section .btn-edit');

    // Textarea should be visible
    await expect(page.locator('#notes-section textarea')).toBeVisible();

    // Fill and save
    await page.fill('#notes-section textarea', 'לקוח מאוד מחויב, מגיע בזמן');
    await page.click('#notes-section button:has-text("שמור")');

    // Verify update
    await expect(page.locator('#flash')).toContainText('ההערות עודכנו');
    await expect(page.locator('#notes-section .content')).toContainText('לקוח מאוד מחויב');
  });

  test('should edit next session plan inline', async ({ page }) => {
    await addTestClient(page, 'דני כהן', 'רקס');

    await expect(page.locator('#plan-section .content')).toContainText('אין תוכנית עדיין');

    await page.click('#plan-section .btn-edit');
    await page.fill('#plan-section textarea', 'לעבוד על הליכה עם כלבים אחרים\nלתרגל recall');
    await page.click('#plan-section button:has-text("שמור")');

    await expect(page.locator('#flash')).toContainText('התוכנית עודכנה');
    await expect(page.locator('#plan-section .content')).toContainText('לעבוד על הליכה עם כלבים אחרים');
  });

  test('should cancel inline editing', async ({ page }) => {
    await addTestClient(page, 'דני כהן', 'רקס');

    await page.click('#notes-section .btn-edit');
    await page.fill('#notes-section textarea', 'טקסט שלא צריך להישמר');
    await page.click('#notes-section button:has-text("ביטול")');

    // Should show empty state again
    await expect(page.locator('#notes-section .content')).toContainText('אין הערות');

    // Verify it wasn't saved
    await page.reload();
    await expect(page.locator('#notes-section .content')).toContainText('אין הערות');
  });
});

// ============================================
// 6. DATA PERSISTENCE (localStorage)
// ============================================

test.describe('Data Persistence', () => {
  test('should persist client data across page reloads', async ({ page }) => {
    await addTestClient(page, 'דני כהן', 'רקס');

    // Reload page
    await page.reload();

    // Navigate via hash
    await page.goto(BASE_URL + '#/');
    await expect(page.locator('.client-card')).toHaveCount(1);
    await expect(page.locator('.client-info h3')).toContainText('דני כהן');
  });

  test('should persist sessions across page reloads', async ({ page }) => {
    await addTestClient(page, 'דני כהן', 'רקס');

    await page.click('text=+ פגישה חדשה');
    await page.fill('#summary', 'פגישה חשובה');
    await page.click('button:has-text("שמור פגישה")');

    await page.reload();

    // Find and click the client
    await page.goto(BASE_URL + '#/');
    await page.click('.client-card');

    await expect(page.locator('.session-card')).toHaveCount(1);
    await expect(page.locator('.session-card')).toContainText('פגישה חשובה');
  });

  test('should persist notes and plan across reloads', async ({ page }) => {
    await addTestClient(page, 'דני כהן', 'רקס');

    // Add notes
    await page.click('#notes-section .btn-edit');
    await page.fill('#notes-section textarea', 'הערה חשובה');
    await page.click('#notes-section button:has-text("שמור")');

    // Add plan
    await page.click('#plan-section .btn-edit');
    await page.fill('#plan-section textarea', 'תוכנית הבאה');
    await page.click('#plan-section button:has-text("שמור")');

    await page.reload();

    await expect(page.locator('#notes-section .content')).toContainText('הערה חשובה');
    await expect(page.locator('#plan-section .content')).toContainText('תוכנית הבאה');
  });
});

// ============================================
// 7. EXPORT/IMPORT
// ============================================

test.describe('Export/Import', () => {
  test('should export data as JSON file', async ({ page }) => {
    await addTestClient(page, 'דני כהן', 'רקס');
    await page.click('text=לקוחות');

    const downloadPromise = page.waitForEvent('download');
    await page.click('text=ייצוא נתונים');
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toMatch(/^clients_backup_\d{4}-\d{2}-\d{2}\.json$/);
  });

  test('should import data from JSON file', async ({ page }) => {
    const testData = JSON.stringify({
      clients: [{
        id: 'test-id-1',
        name: 'לקוח מיובא',
        phone: '050-9999999',
        address: '',
        notes: '',
        dog: { name: 'כלב מיובא', breed: 'מעורב', age: '5', weight: '', issues: '' },
        sessions: [],
        next_session_plan: '',
        created_at: '2026-01-01'
      }]
    });

    await page.goto(BASE_URL);

    // Create a file and upload it
    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.locator('input[type="file"]').evaluate(el => el.click())
    ]);

    await fileChooser.setFiles({
      name: 'test-import.json',
      mimeType: 'application/json',
      buffer: Buffer.from(testData, 'utf-8')
    });

    // Verify import
    await expect(page.locator('#flash')).toContainText('הנתונים יובאו בהצלחה');
    await expect(page.locator('.client-card')).toHaveCount(1);
    await expect(page.locator('.client-info h3')).toContainText('לקוח מיובא');
  });

  test('should reject invalid JSON import', async ({ page }) => {
    await page.goto(BASE_URL);

    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.locator('input[type="file"]').evaluate(el => el.click())
    ]);

    await fileChooser.setFiles({
      name: 'bad.json',
      mimeType: 'application/json',
      buffer: Buffer.from('not valid json', 'utf-8')
    });

    await expect(page.locator('#flash')).toContainText('שגיאה בייבוא');
  });

  test('should reject JSON without clients array', async ({ page }) => {
    await page.goto(BASE_URL);

    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.locator('input[type="file"]').evaluate(el => el.click())
    ]);

    await fileChooser.setFiles({
      name: 'bad-structure.json',
      mimeType: 'application/json',
      buffer: Buffer.from('{"data": []}', 'utf-8')
    });

    await expect(page.locator('#flash')).toContainText('שגיאה בייבוא');
  });
});

// ============================================
// 8. EDGE CASES & ERROR HANDLING
// ============================================

test.describe('Edge Cases', () => {
  test('should handle navigating to non-existent client', async ({ page }) => {
    await page.goto(BASE_URL + '#/client/non-existent-id');

    await expect(page.locator('#flash')).toContainText('לקוח לא נמצא');
    // Should navigate back to home
    await expect(page.locator('h2')).toContainText('הלקוחות שלי');
  });

  test('should handle special characters in client name', async ({ page }) => {
    await addTestClient(page, 'דני "המאלף" כהן', 'רקס<הגדול>');
    await expect(page.locator('h2')).toContainText('דני "המאלף" כהן');
    // Verify no XSS - angle brackets should be escaped
    const h2Text = await page.locator('h2').textContent();
    expect(h2Text).toContain('רקס<הגדול>');
  });

  test('should handle very long text in notes', async ({ page }) => {
    await addTestClient(page, 'דני כהן', 'רקס');
    const longText = 'הערה ארוכה מאוד. '.repeat(100);

    await page.click('#notes-section .btn-edit');
    await page.fill('#notes-section textarea', longText);
    await page.click('#notes-section button:has-text("שמור")');

    await page.reload();
    const content = await page.locator('#notes-section .content').textContent();
    expect(content.length).toBeGreaterThan(500);
  });

  test('should handle Hebrew and English mixed text', async ({ page }) => {
    await addTestClient(page, 'דני Cohen', 'Rex רקס');
    await expect(page.locator('h2')).toContainText('דני Cohen – Rex רקס');
  });

  test('should handle empty search gracefully', async ({ page }) => {
    await addTestClient(page, 'דני כהן', 'רקס');
    await page.click('text=לקוחות');

    await page.fill('#search-input', '');
    await expect(page.locator('.client-card')).toHaveCount(1);
  });

  test('should handle session form cancel', async ({ page }) => {
    await addTestClient(page, 'דני כהן', 'רקס');
    await page.click('text=+ פגישה חדשה');
    await page.fill('#summary', 'טקסט שלא צריך להישמר');
    await page.click('text=ביטול');

    // Should be back on client page with no sessions
    await expect(page.locator('.session-card')).toHaveCount(0);
  });

  test('should handle client form cancel', async ({ page }) => {
    await page.click('text=+ לקוח חדש');
    await page.fill('#name', 'לקוח שלא נשמר');
    await page.click('a:has-text("ביטול")');

    // Should be back on home page with no clients
    await expect(page.locator('.empty-state')).toBeVisible();
  });

  test('should handle corrupted localStorage gracefully', async ({ page }) => {
    // Set corrupted data
    await page.evaluate(() => {
      localStorage.setItem('dog_training_clients', 'not-valid-json{{{');
    });
    await page.reload();

    // App should still work - showing empty state
    await expect(page.locator('.empty-state')).toBeVisible();
  });

  test('should handle client with empty dog object fields', async ({ page }) => {
    await page.evaluate(() => {
      localStorage.setItem('dog_training_clients', JSON.stringify({
        clients: [{
          id: 'test-1',
          name: 'Test',
          phone: '',
          address: '',
          notes: '',
          dog: { name: 'Dog', breed: '', age: '', weight: '', issues: '' },
          sessions: [],
          next_session_plan: '',
          created_at: '2026-03-30'
        }]
      }));
    });
    await page.reload();

    await page.click('.client-card');

    // Should render without errors, empty fields should be hidden
    await expect(page.locator('h2')).toContainText('Test – Dog');
  });
});

// ============================================
// 9. UI/UX DETAILS
// ============================================

test.describe('UI/UX', () => {
  test('should show phone as clickable tel: link', async ({ page }) => {
    await addTestClient(page, 'דני כהן', 'רקס', '', '050-1234567');

    const phoneLink = page.locator('a[href^="tel:"]');
    await expect(phoneLink).toBeVisible();
    await expect(phoneLink).toContainText('050-1234567');
  });

  test('should show last session date in client list', async ({ page }) => {
    await addTestClient(page, 'דני כהן', 'רקס');

    await page.click('text=+ פגישה חדשה');
    await page.fill('#date', '2026-03-28');
    await page.fill('#summary', 'פגישה');
    await page.click('button:has-text("שמור פגישה")');

    await page.click('text=לקוחות');
    await expect(page.locator('.meta')).toContainText('2026-03-28');
  });

  test('should show session history section title with count', async ({ page }) => {
    await addTestClient(page, 'דני כהן', 'רקס');

    await expect(page.locator('.sessions-section h3')).toContainText('היסטוריית פגישות (0)');

    await page.click('text=+ פגישה חדשה');
    await page.fill('#summary', 'פגישה');
    await page.click('button:has-text("שמור פגישה")');

    await expect(page.locator('.sessions-section h3')).toContainText('היסטוריית פגישות (1)');
  });

  test('flash message should auto-hide after a few seconds', async ({ page }) => {
    await addTestClient(page, 'דני כהן', 'רקס');
    await expect(page.locator('#flash')).toBeVisible();

    // Wait for flash to disappear (3 second timeout + small buffer)
    await page.waitForTimeout(3500);
    await expect(page.locator('#flash')).toBeHidden();
  });
});

// ============================================
// HELPER FUNCTIONS
// ============================================

async function addTestClient(page, name, dogName, dogBreed = '', phone = '') {
  await page.click('text=+ לקוח חדש');
  await addTestClientFromForm(page, name, dogName, dogBreed, phone);
}

async function addTestClientFromForm(page, name, dogName, dogBreed = '', phone = '') {
  await page.fill('#name', name);
  if (phone) await page.fill('#phone', phone);
  await page.fill('#dog_name', dogName);
  if (dogBreed) await page.fill('#dog_breed', dogBreed);
  await page.click('button:has-text("הוסף לקוח")');
}
