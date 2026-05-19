#include <iostream>
#include <vector>
#include <random>
#include <algorithm>
#include <numeric>

int main(int argc, char* argv[]) {
    std::mt19937 rng(std::stoi(argv[1]));
    int n = (std::stoi(argv[1]) % 10 == 0) ? 2 : (std::stoi(argv[1]) % 100000) + 2;
    if (n < 2) n = 2;
    std::uniform_int_distribution<long long> dist(-1e8, 1e8);
    std::vector<long long> nums(n);
    for(int i=0; i<n; ++i) nums[i] = dist(rng);
    int i = std::uniform_int_distribution<int>(0, n-2)(rng);
    int j = std::uniform_int_distribution<int>(i+1, n-1)(rng);
    long long target = nums[i] + nums[j];
    std::cout << n << " " << target << std::endl;
    for(int k=0; k<n; ++k) std::cout << nums[k] << (k == n-1 ? "" : " ");
    std::cout << std::endl;
    return 0;
}
