#include <bits/stdc++.h>
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
