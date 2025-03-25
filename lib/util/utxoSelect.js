"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.findMinFiveSum = findMinFiveSum;
exports.findMinFourSum = findMinFourSum;
exports.findMinThreeSum = findMinThreeSum;
exports.findMinTwoSum = findMinTwoSum;
/**
 * Finds the minimum sum of five numbers in an array that is greater than or equal to a target value.
 * @param balances - The array of numbers.
 * @param target - The target value.
 * @returns The indices of the five numbers that form the minimum sum.
 */
function findMinFiveSum(balances, target) {
    balances.sort(function (a, b) { return Number(a - b); });
    var n = balances.length;
    var minFive = [];
    var minSum = BigInt(Number.MAX_SAFE_INTEGER);
    for (var i = 0; i <= n - 5; i++) {
        for (var j = i + 1; j <= n - 4; j++) {
            var left = j + 1;
            var right = n - 1;
            while (left < right - 1) {
                var sum = balances[i] + balances[j] + balances[left] + balances[right] + balances[right - 1];
                if (sum >= target && sum < minSum) {
                    minSum = sum;
                    minFive = [i, j, left, right - 1, right];
                }
                if (sum < target) {
                    left++;
                }
                else {
                    right--;
                }
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
function findMinFourSum(balances, target) {
    balances.sort(function (a, b) { return Number(a - b); });
    var n = balances.length;
    var minFour = [];
    var minSum = BigInt(Number.MAX_SAFE_INTEGER);
    for (var i = 0; i <= n - 4; i++) {
        for (var j = i + 1; j <= n - 3; j++) {
            var left = j + 1;
            var right = n - 1;
            while (left < right) {
                var sum = balances[i] + balances[j] + balances[left] + balances[right];
                if (sum >= target && sum < minSum) {
                    minSum = sum;
                    minFour = [i, j, left, right];
                }
                if (sum < target) {
                    left++;
                }
                else {
                    right--;
                }
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
function findMinThreeSum(balances, target) {
    balances.sort(function (a, b) { return Number(a - b); });
    var n = balances.length;
    var minThree = [];
    var minSum = BigInt(Number.MAX_SAFE_INTEGER);
    for (var i = 0; i <= n - 3; i++) {
        var left = i + 1;
        var right = n - 1;
        while (left < right) {
            var sum = balances[i] + balances[left] + balances[right];
            if (sum >= target && sum < minSum) {
                minSum = sum;
                minThree = [i, left, right];
            }
            if (sum < target) {
                left++;
            }
            else {
                right--;
            }
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
function findMinTwoSum(balances, target) {
    balances.sort(function (a, b) { return Number(a - b); });
    var n = balances.length;
    var minTwo = [];
    var minSum = BigInt(Number.MAX_SAFE_INTEGER);
    var left = 0;
    var right = n - 1;
    while (left < right) {
        var sum = balances[left] + balances[right];
        if (sum >= target && sum < minSum) {
            minSum = sum;
            minTwo = [left, right];
        }
        if (sum < target) {
            left++;
        }
        else {
            right--;
        }
    }
    return minTwo.length === 2 ? minTwo : null;
}
