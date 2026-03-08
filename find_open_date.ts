import { searchAvailability } from './src/reserveamerica';

async function findDate() {
    const currentDate = new Date();

    // Start checking from tomorrow
    currentDate.setDate(currentDate.getDate() + 1);

    for (let i = 0; i < 90; i++) {
        currentDate.setDate(currentDate.getDate() + 2);
        const m = String(currentDate.getMonth() + 1).padStart(2, '0');
        const d = String(currentDate.getDate()).padStart(2, '0');
        const y = currentDate.getFullYear();
        const dateStr = `${m}/${d}/${y}`;

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
        } catch (e: any) {
            console.error(e.message);
        }

        await new Promise(r => setTimeout(r, 500));
    }
    console.log('No dates found with 3+ sites.');
}

findDate();
