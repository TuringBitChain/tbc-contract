/**
 * Finds the minimum sum of five numbers in an array that is greater than or equal to a target value.
 * @param balances - The array of numbers.
 * @param target - The target value.
 * @returns The indices of the five numbers that form the minimum sum.
 */
export function findMinFiveSum(balances: bigint[], target: bigint): number[] | null {
    balances.sort((a, b) => Number(a - b));
    const n = balances.length;
    let minFive: number[] = [];
    let minSum: bigint = BigInt(Number.MAX_SAFE_INTEGER);
    for (let i = 0; i <= n - 5; i++) {
        for (let j = i + 1; j <= n - 4; j++) {
            let left = j + 1;
            let right = n - 1;
            while (left < right - 1) {
                const sum = balances[i] + balances[j] + balances[left] + balances[right] + balances[right - 1];
                if (sum >= target && sum < minSum) { minSum = sum; minFive = [i, j, left, right - 1, right]; }
                if (sum < target) { left++; }
                else { right--; }
            }
        }
    }
    return minFive.length === 5 ? minFive : null;
}

/**
 * Finds the minimum sum of four numbers in an array that is greater than or equal to a target value.
 * @param balances - The array of numbers.
 * @param target - The target value.
 * @returns The indices of the four numbers that form the minimum sum.
 */
export function findMinFourSum(balances: bigint[], target: bigint): number[] | null {
    balances.sort((a, b) => Number(a - b));
    const n = balances.length;
    let minFour: number[] = [];
    let minSum: bigint = BigInt(Number.MAX_SAFE_INTEGER);
    for (let i = 0; i <= n - 4; i++) {
        for (let j = i + 1; j <= n - 3; j++) {
            let left = j + 1;
            let right = n - 1;
            while (left < right) {
                const sum = balances[i] + balances[j] + balances[left] + balances[right];
                if (sum >= target && sum < minSum) { minSum = sum; minFour = [i, j, left, right]; }
                if (sum < target) { left++; }
                else { right--; }
            }
        }
    }
    return minFour.length === 4 ? minFour : null;
}

/**
 * Finds the minimum sum of three numbers in an array that is greater than or equal to a target value.
 * @param balances - The array of numbers.
 * @param target - The target value.
 * @returns The indices of the three numbers that form the minimum sum.
 */
export function findMinThreeSum(balances: bigint[], target: bigint): number[] | null {
    balances.sort((a, b) => Number(a - b));
    const n = balances.length;
    let minThree: number[] = [];
    let minSum: bigint = BigInt(Number.MAX_SAFE_INTEGER);
    for (let i = 0; i <= n - 3; i++) {
        let left = i + 1;
        let right = n - 1;
        while (left < right) {
            const sum = balances[i] + balances[left] + balances[right];
            if (sum >= target && sum < minSum) { minSum = sum; minThree = [i, left, right]; }
            if (sum < target) { left++; }
            else { right--; }
        }

    }
    return minThree.length === 3 ? minThree : null;
}

/**
 * Finds the minimum sum of two numbers in an array that is greater than or equal to a target value.
 * @param balances - The array of numbers.
 * @param target - The target value.
 * @returns The indices of the two numbers that form the minimum sum.
 */
export function findMinTwoSum(balances: bigint[], target: bigint): number[] | null {
    balances.sort((a, b) => Number(a - b));
    const n = balances.length;
    let minTwo: number[] = [];
    let minSum: bigint = BigInt(Number.MAX_SAFE_INTEGER);
    let left = 0;
    let right = n - 1;
    while (left < right) {
        const sum = balances[left] + balances[right];
        if (sum >= target && sum < minSum) { minSum = sum; minTwo = [left, right]; }
        if (sum < target) { left++; }
        else { right--; }
    }
    return minTwo.length === 2 ? minTwo : null;
}
