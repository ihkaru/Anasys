
import sys
import time
import os

# Add local libs to path
sys.path.append(os.path.join(os.path.dirname(__file__), '../python-libs/tradingview-scraper'))

try:
    from tradingview_scraper.symbols.stream import RealTimeData
    from tradingview_scraper.symbols.ideas import Ideas
except ImportError:
    print("CRITICAL: Missing dependencies (pandas, pydantic). Please install them via pip.")
    sys.exit(1)

def stress_test():
    print("=== STARTING TRADINGVIEW STRESS TEST ===")
    rt = RealTimeData()
    ideas = Ideas()
    
    symbol = "BINANCE:BTCUSDT"
    iterations = 50
    failures = 0
    success = 0
    
    print(f"Target: {symbol}")
    print(f"Iterations: {iterations}")

    for i in range(iterations):
        try:
            print(f"[{i+1}/{iterations}] Requesting...", end="\r")
            _ = ideas.scrape(symbol="BTCUSD", startPage=1, endPage=1)
            success += 1
            time.sleep(0.5) 
        except Exception as e:
            print(f"\n[FAIL] Iteration {i+1}: {str(e)}")
            failures += 1
            if "403" in str(e) or "429" in str(e):
                print("⛔ BLOCKED! (403 Forbidden or 429 Too Many Requests)")
                break

    print("\n\n=== RESULT ===")
    print(f"Success: {success}")
    print(f"Failures: {failures}")

if __name__ == "__main__":
    stress_test()
