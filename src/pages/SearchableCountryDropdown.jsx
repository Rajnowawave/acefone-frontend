import React, { useState, useRef, useEffect, useMemo } from "react";
import { FaSearch, FaChevronDown, FaTimes, FaGlobe, FaCheck } from "react-icons/fa";
import "./SearchableCountryDropdown.css";

// Complete country codes list
export const countryCodes = [
  { code: "+91", country: "India", flag: "🇮🇳", minLength: 10, maxLength: 10, keywords: ["ind", "bharat", "hindustan"] },
  { code: "+1", country: "USA", flag: "🇺🇸", minLength: 10, maxLength: 10, keywords: ["america", "united states", "us", "usa"] },
  { code: "+1", country: "Canada", flag: "🇨🇦", minLength: 10, maxLength: 10, keywords: ["can", "canadian"] },
  { code: "+44", country: "United Kingdom", flag: "🇬🇧", minLength: 10, maxLength: 11, keywords: ["uk", "britain", "england", "gb", "british"] },
  { code: "+971", country: "UAE", flag: "🇦🇪", minLength: 9, maxLength: 9, keywords: ["dubai", "emirates", "abu dhabi", "uae", "arab"] },
  { code: "+966", country: "Saudi Arabia", flag: "🇸🇦", minLength: 9, maxLength: 9, keywords: ["ksa", "saudi", "arabia"] },
  { code: "+974", country: "Qatar", flag: "🇶🇦", minLength: 8, maxLength: 8, keywords: ["doha", "qatari"] },
  { code: "+968", country: "Oman", flag: "🇴🇲", minLength: 8, maxLength: 8, keywords: ["muscat", "omani"] },
  { code: "+973", country: "Bahrain", flag: "🇧🇭", minLength: 8, maxLength: 8, keywords: ["bahraini"] },
  { code: "+965", country: "Kuwait", flag: "🇰🇼", minLength: 8, maxLength: 8, keywords: ["kuwaiti"] },
  { code: "+61", country: "Australia", flag: "🇦🇺", minLength: 9, maxLength: 9, keywords: ["aus", "aussie", "australian"] },
  { code: "+64", country: "New Zealand", flag: "🇳🇿", minLength: 9, maxLength: 10, keywords: ["nz", "kiwi"] },
  { code: "+65", country: "Singapore", flag: "🇸🇬", minLength: 8, maxLength: 8, keywords: ["sg", "singaporean"] },
  { code: "+60", country: "Malaysia", flag: "🇲🇾", minLength: 9, maxLength: 10, keywords: ["my", "malaysian"] },
  { code: "+49", country: "Germany", flag: "🇩🇪", minLength: 10, maxLength: 11, keywords: ["de", "deutsch", "german"] },
  { code: "+33", country: "France", flag: "🇫🇷", minLength: 9, maxLength: 9, keywords: ["fr", "french", "paris"] },
  { code: "+39", country: "Italy", flag: "🇮🇹", minLength: 9, maxLength: 10, keywords: ["it", "italian", "rome"] },
  { code: "+34", country: "Spain", flag: "🇪🇸", minLength: 9, maxLength: 9, keywords: ["es", "spanish", "madrid"] },
  { code: "+81", country: "Japan", flag: "🇯🇵", minLength: 10, maxLength: 11, keywords: ["jp", "nippon", "japanese", "tokyo"] },
  { code: "+82", country: "South Korea", flag: "🇰🇷", minLength: 9, maxLength: 10, keywords: ["korea", "kr", "korean", "seoul"] },
  { code: "+86", country: "China", flag: "🇨🇳", minLength: 11, maxLength: 11, keywords: ["cn", "chinese", "beijing"] },
  { code: "+852", country: "Hong Kong", flag: "🇭🇰", minLength: 8, maxLength: 8, keywords: ["hk"] },
  { code: "+27", country: "South Africa", flag: "🇿🇦", minLength: 9, maxLength: 9, keywords: ["za", "african"] },
  { code: "+254", country: "Kenya", flag: "🇰🇪", minLength: 9, maxLength: 9, keywords: ["ke", "kenyan", "nairobi"] },
  { code: "+234", country: "Nigeria", flag: "🇳🇬", minLength: 10, maxLength: 10, keywords: ["ng", "nigerian", "lagos"] },
  { code: "+55", country: "Brazil", flag: "🇧🇷", minLength: 10, maxLength: 11, keywords: ["br", "brasil", "brazilian"] },
  { code: "+52", country: "Mexico", flag: "🇲🇽", minLength: 10, maxLength: 10, keywords: ["mx", "mexican"] },
  { code: "+92", country: "Pakistan", flag: "🇵🇰", minLength: 10, maxLength: 10, keywords: ["pk", "pak", "pakistani"] },
  { code: "+880", country: "Bangladesh", flag: "🇧🇩", minLength: 10, maxLength: 10, keywords: ["bd", "bangla", "bangladeshi", "dhaka"] },
  { code: "+94", country: "Sri Lanka", flag: "🇱🇰", minLength: 9, maxLength: 9, keywords: ["lk", "lanka", "ceylon", "colombo"] },
  { code: "+977", country: "Nepal", flag: "🇳🇵", minLength: 10, maxLength: 10, keywords: ["np", "nepali", "kathmandu"] },
  { code: "+63", country: "Philippines", flag: "🇵🇭", minLength: 10, maxLength: 10, keywords: ["ph", "filipino", "manila"] },
  { code: "+66", country: "Thailand", flag: "🇹🇭", minLength: 9, maxLength: 9, keywords: ["th", "thai", "bangkok"] },
  { code: "+84", country: "Vietnam", flag: "🇻🇳", minLength: 9, maxLength: 10, keywords: ["vn", "vietnamese", "hanoi"] },
  { code: "+62", country: "Indonesia", flag: "🇮🇩", minLength: 10, maxLength: 12, keywords: ["id", "indonesian", "jakarta"] },
  { code: "+7", country: "Russia", flag: "🇷🇺", minLength: 10, maxLength: 10, keywords: ["ru", "russian", "moscow"] },
  { code: "+380", country: "Ukraine", flag: "🇺🇦", minLength: 9, maxLength: 9, keywords: ["ua", "ukrainian", "kyiv"] },
  { code: "+48", country: "Poland", flag: "🇵🇱", minLength: 9, maxLength: 9, keywords: ["pl", "polish", "warsaw"] },
  { code: "+31", country: "Netherlands", flag: "🇳🇱", minLength: 9, maxLength: 9, keywords: ["nl", "dutch", "holland", "amsterdam"] },
  { code: "+32", country: "Belgium", flag: "🇧🇪", minLength: 9, maxLength: 9, keywords: ["be", "belgian", "brussels"] },
  { code: "+41", country: "Switzerland", flag: "🇨🇭", minLength: 9, maxLength: 9, keywords: ["ch", "swiss", "zurich"] },
  { code: "+43", country: "Austria", flag: "🇦🇹", minLength: 10, maxLength: 11, keywords: ["at", "austrian", "vienna"] },
  { code: "+46", country: "Sweden", flag: "🇸🇪", minLength: 9, maxLength: 10, keywords: ["se", "swedish", "stockholm"] },
  { code: "+47", country: "Norway", flag: "🇳🇴", minLength: 8, maxLength: 8, keywords: ["no", "norwegian", "oslo"] },
  { code: "+45", country: "Denmark", flag: "🇩🇰", minLength: 8, maxLength: 8, keywords: ["dk", "danish", "copenhagen"] },
  { code: "+358", country: "Finland", flag: "🇫🇮", minLength: 9, maxLength: 10, keywords: ["fi", "finnish", "helsinki"] },
  { code: "+353", country: "Ireland", flag: "🇮🇪", minLength: 9, maxLength: 9, keywords: ["ie", "irish", "dublin"] },
  { code: "+351", country: "Portugal", flag: "🇵🇹", minLength: 9, maxLength: 9, keywords: ["pt", "portuguese", "lisbon"] },
  { code: "+30", country: "Greece", flag: "🇬🇷", minLength: 10, maxLength: 10, keywords: ["gr", "greek", "athens"] },
  { code: "+90", country: "Turkey", flag: "🇹🇷", minLength: 10, maxLength: 10, keywords: ["tr", "turkish", "turkiye", "istanbul"] },
  { code: "+972", country: "Israel", flag: "🇮🇱", minLength: 9, maxLength: 9, keywords: ["il", "israeli", "tel aviv"] },
  { code: "+20", country: "Egypt", flag: "🇪🇬", minLength: 10, maxLength: 10, keywords: ["eg", "egyptian", "cairo"] },
  { code: "+212", country: "Morocco", flag: "🇲🇦", minLength: 9, maxLength: 9, keywords: ["ma", "moroccan"] },
  { code: "+216", country: "Tunisia", flag: "🇹🇳", minLength: 8, maxLength: 8, keywords: ["tn", "tunisian"] },
  { code: "+213", country: "Algeria", flag: "🇩🇿", minLength: 9, maxLength: 9, keywords: ["dz", "algerian"] },
  { code: "+98", country: "Iran", flag: "🇮🇷", minLength: 10, maxLength: 10, keywords: ["ir", "persian", "tehran"] },
  { code: "+964", country: "Iraq", flag: "🇮🇶", minLength: 10, maxLength: 10, keywords: ["iq", "iraqi", "baghdad"] },
  { code: "+962", country: "Jordan", flag: "🇯🇴", minLength: 9, maxLength: 9, keywords: ["jo", "jordanian", "amman"] },
  { code: "+961", country: "Lebanon", flag: "🇱🇧", minLength: 8, maxLength: 8, keywords: ["lb", "lebanese", "beirut"] },
  { code: "+960", country: "Maldives", flag: "🇲🇻", minLength: 7, maxLength: 7, keywords: ["mv", "male", "maldivian"] },
  { code: "+95", country: "Myanmar", flag: "🇲🇲", minLength: 9, maxLength: 10, keywords: ["mm", "burma", "burmese"] },
  { code: "+855", country: "Cambodia", flag: "🇰🇭", minLength: 9, maxLength: 9, keywords: ["kh", "cambodian", "phnom penh"] },
  { code: "+856", country: "Laos", flag: "🇱🇦", minLength: 10, maxLength: 10, keywords: ["la", "laotian"] },
  { code: "+673", country: "Brunei", flag: "🇧🇳", minLength: 7, maxLength: 7, keywords: ["bn"] },
  { code: "+679", country: "Fiji", flag: "🇫🇯", minLength: 7, maxLength: 7, keywords: ["fj", "fijian"] },
  { code: "+56", country: "Chile", flag: "🇨🇱", minLength: 9, maxLength: 9, keywords: ["cl", "chilean", "santiago"] },
  { code: "+54", country: "Argentina", flag: "🇦🇷", minLength: 10, maxLength: 10, keywords: ["ar", "argentine", "buenos aires"] },
  { code: "+57", country: "Colombia", flag: "🇨🇴", minLength: 10, maxLength: 10, keywords: ["co", "colombian", "bogota"] },
  { code: "+51", country: "Peru", flag: "🇵🇪", minLength: 9, maxLength: 9, keywords: ["pe", "peruvian", "lima"] },
  { code: "+58", country: "Venezuela", flag: "🇻🇪", minLength: 10, maxLength: 10, keywords: ["ve", "venezuelan", "caracas"] },
  { code: "+233", country: "Ghana", flag: "🇬🇭", minLength: 9, maxLength: 9, keywords: ["gh", "ghanaian", "accra"] },
  { code: "+255", country: "Tanzania", flag: "🇹🇿", minLength: 9, maxLength: 9, keywords: ["tz", "tanzanian"] },
  { code: "+256", country: "Uganda", flag: "🇺🇬", minLength: 9, maxLength: 9, keywords: ["ug", "ugandan", "kampala"] },
  { code: "+251", country: "Ethiopia", flag: "🇪🇹", minLength: 9, maxLength: 9, keywords: ["et", "ethiopian"] },
  { code: "+263", country: "Zimbabwe", flag: "🇿🇼", minLength: 9, maxLength: 9, keywords: ["zw", "zimbabwean"] },
];

const popularCountryCodes = ["+91", "+1", "+44", "+971", "+61", "+65", "+966"];

const SearchableCountryDropdown = ({ 
  value, 
  onChange, 
  name, 
  id, 
  disabled = false 
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const dropdownRef = useRef(null);
  const searchInputRef = useRef(null);
  const listRef = useRef(null);

  const selectedCountry = useMemo(() => {
    return countryCodes.find(c => c.code === value) || countryCodes[0];
  }, [value]);

  const filteredCountries = useMemo(() => {
    const search = searchTerm.toLowerCase().trim();
    if (!search) return countryCodes;
    
    return countryCodes.filter(country => {
      if (country.country.toLowerCase().includes(search)) return true;
      if (country.code.includes(search) || country.code.replace('+', '').includes(search)) return true;
      if (country.keywords.some(kw => kw.toLowerCase().includes(search))) return true;
      return false;
    });
  }, [searchTerm]);

  const popularCountries = useMemo(() => {
    return popularCountryCodes.map(code => 
      countryCodes.find(c => c.code === code)
    ).filter(Boolean);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
        setSearchTerm("");
        setHighlightedIndex(0);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      setTimeout(() => {
        searchInputRef.current.focus();
      }, 50);
    }
  }, [isOpen]);

  useEffect(() => {
    setHighlightedIndex(0);
  }, [searchTerm]);

  useEffect(() => {
    if (listRef.current && isOpen && filteredCountries.length > 0) {
      const highlightedElement = listRef.current.children[highlightedIndex];
      if (highlightedElement) {
        highlightedElement.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    }
  }, [highlightedIndex, isOpen, filteredCountries.length]);

  const handleKeyDown = (e) => {
    if (!isOpen) {
      if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
        e.preventDefault();
        setIsOpen(true);
      }
      return;
    }

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setHighlightedIndex(prev => 
          prev < filteredCountries.length - 1 ? prev + 1 : 0
        );
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlightedIndex(prev => 
          prev > 0 ? prev - 1 : filteredCountries.length - 1
        );
        break;
      case "Enter":
        e.preventDefault();
        if (filteredCountries[highlightedIndex]) {
          handleSelectCountry(filteredCountries[highlightedIndex]);
        }
        break;
      case "Escape":
        e.preventDefault();
        setIsOpen(false);
        setSearchTerm("");
        break;
      case "Tab":
        setIsOpen(false);
        setSearchTerm("");
        break;
      default:
        break;
    }
  };

  const handleSelectCountry = (country) => {
    onChange(country.code);
    setIsOpen(false);
    setSearchTerm("");
    setHighlightedIndex(0);
  };

  const toggleDropdown = () => {
    if (!disabled) {
      setIsOpen(!isOpen);
      if (isOpen) {
        setSearchTerm("");
        setHighlightedIndex(0);
      }
    }
  };

  const clearSearch = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setSearchTerm("");
    searchInputRef.current?.focus();
  };

  return (
    <div 
      className={`country-select ${isOpen ? "open" : ""} ${disabled ? "disabled" : ""}`}
      ref={dropdownRef}
    >
      {/* Trigger Button - Shows Flag + Code */}
      <button
        type="button"
        className="country-select-btn"
        onClick={toggleDropdown}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span className="cs-flag">{selectedCountry.flag}</span>
        <span className="cs-code">{selectedCountry.code}</span>
        <FaChevronDown className={`cs-arrow ${isOpen ? "up" : ""}`} />
      </button>

      {/* Dropdown Panel */}
      {isOpen && (
        <div className="country-select-dropdown">
          {/* Search Input */}
          <div className="cs-search">
            
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search country..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={handleKeyDown}
              autoComplete="off"
            />
            {searchTerm && (
              <button type="button" className="cs-clear" onClick={clearSearch}>
                <FaTimes />
              </button>
            )}
          </div>

          {/* Popular Countries */}
          {!searchTerm && (
            <div className="cs-popular">
              <div className="cs-popular-title">Popular</div>
              <div className="cs-popular-list">
                {popularCountries.map((country, idx) => (
                  <button
                    key={`pop-${country.code}-${idx}`}
                    type="button"
                    className={`cs-popular-item ${value === country.code ? "active" : ""}`}
                    onClick={() => handleSelectCountry(country)}
                  >
                    {country.flag} {country.code}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Country List */}
          <div className="cs-list-wrap">
            {searchTerm && filteredCountries.length > 0 && (
              <div className="cs-results-count">
                {filteredCountries.length} found
              </div>
            )}
            
            <div className="cs-list" ref={listRef}>
              {filteredCountries.length > 0 ? (
                filteredCountries.map((country, index) => (
                  <div
                    key={`${country.code}-${country.country}-${index}`}
                    className={`cs-item ${value === country.code && selectedCountry.country === country.country ? "selected" : ""} ${index === highlightedIndex ? "highlighted" : ""}`}
                    onClick={() => handleSelectCountry(country)}
                  >
                    <span className="cs-item-flag">{country.flag}</span>
                    <span className="cs-item-name">{country.country}</span>
                    <span className="cs-item-code">{country.code}</span>
                    {value === country.code && selectedCountry.country === country.country && (
                      <FaCheck className="cs-item-check" />
                    )}
                  </div>
                ))
              ) : (
                <div className="cs-no-results">
                  <FaGlobe />
                  <span>No countries found</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SearchableCountryDropdown;