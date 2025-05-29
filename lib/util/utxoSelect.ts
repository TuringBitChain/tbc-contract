/**
 * Finds the minimum sum of five numbers in an array that is greater than or equal to a target value.
 * @param balances - The array of numbers.
 * @param target - The target value.
 * @returns The indices of the five numbers that form the minimum sum.
 */
export function findMinFiveSum(
  balances: bigint[],
  target: bigint
): number[] | null {
  const n = balances.length;
  let minFive: number[] = [];
  let minSum: bigint = BigInt(Number.MAX_SAFE_INTEGER);
  for (let i = 0; i <= n - 5; i++) {
    for (let j = i + 1; j <= n - 4; j++) {
      let left = j + 1;
      let right = n - 1;
      while (left < right - 1) {
        const sum =
          balances[i] +
          balances[j] +
          balances[left] +
          balances[right] +
          balances[right - 1];
        if (sum >= target && sum < minSum) {
          minSum = sum;
          minFive = [i, j, left, right - 1, right];
        }
        if (sum < target) {
          left++;
        } else {
          right--;
        }
      }
    }
  }
  return minFive.length === 5 ? minFive : null;
}
