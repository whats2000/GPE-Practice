// binji/wasm-clang compatible version of sample.cpp
//
// <bits/stdc++.h> is a GCC-only umbrella header that does NOT exist in
// LLVM libc++ (which binji's sysroot uses). This file replaces it with
// the explicit standard headers that cover the symbols used: vector, map,
// algorithm, iostream, and ios (for ios_base).
//
// Expected output for cases/sample-01.in is identical to sample.cpp.

#include <iostream>
#include <vector>
#include <algorithm>
#include <map>
using namespace std;

int main() {
    ios_base::sync_with_stdio(false);
    cin.tie(nullptr);

    int n;
    cin >> n;
    vector<long long> a(n);
    for (int i = 0; i < n; ++i) cin >> a[i];

    sort(a.begin(), a.end());

    long long sum = 0;
    map<long long, int> freq;
    for (auto x : a) {
        sum += x;
        freq[x]++;
    }

    long long mode = a[0];
    int best = 0;
    for (auto& [k, v] : freq) {
        if (v > best) { best = v; mode = k; }
    }

    cout << sum << "\n" << mode << "\n";
    return 0;
}
