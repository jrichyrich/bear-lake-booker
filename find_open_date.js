const { searchAvailability } = require('./dist/reserveamerica.js');

async function findDate() {
  const currentDate = new Date();
  
  // Start from next month
  currentDate.setMonth(currentDate.getMonth() + 1);
  
  for (let i = 0; i < 30; i++) {
    currentDate.setDate(currentDate.getDate() + 1);
    const dateStr = `${String(currentDate.getMonth() + 1).padStart(2, '0')}/${String(currentDate.getDate()).padStart(2, '0')}/${currentDate.getFullYear()}`;
    
    console.log(`Checking ${dateStr}...`);
    try {
      const result = await searchAvailability({
        date: dateStr,
        length: '2',
        loop: 'BIRCH'
      });
      
      if (result.exactDateMatches && result.exactDateMatches.length >= 3) {
        console.log(`SUCCESS! Found ${result.exactDateMatches.length} sites on ${dateStr}`);
        console.log(result.exactDateMatches.map(s => s.site).join(', '));
        return dateStr;
      } else if (result.exactDateMatches && result.exactDateMatches.length > 0) {
        console.log(`  - Only ${result.exactDateMatches.length} sites found on ${dateStr}`);
      }
    } catch(e) {
      console.error(e.message);
    }
    
    // Slight pause to avoid spamming hitting rate limits during this quick check
    await new Promise(r => setTimeout(r, 500));
  }
  console.log('No dates found with 3+ sites.');
}

findDate();
