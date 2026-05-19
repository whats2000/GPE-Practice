#include <iostream>
#include <vector>
#include <set>

int main() {
    long long n, target;
    if (!(std::cin >> n >> target)) return 1;
    if (n < 1 || n > 100000) return 1;
    std::vector<long long> nums(n);
    for(int i=0; i<n; ++i) {
        if (!(std::cin >> nums[i])) return 1;
        if (nums[i] < -1000000000LL || nums[i] > 1000000000LL) return 1;
    }
    int count = 0;
    for(int i=0; i<n; ++i) {
        for(int j=i+1; j<n; ++j) {
            if (nums[i] + nums[j] == target) count++;
        }
    }
    if (count != 1) return 1;
    return 0;
}
