jQuery(document).ready(function ($) {
  let capturing = false;
  let capturedCanvas = null;

  async function smoothScroll(to) {
    window.scrollTo({
      top: to,
      behavior: "auto",
    });
    return new Promise((resolve) => setTimeout(resolve, 100));
  }

  async function captureSection(scrollTop) {
    const canvas = await html2canvas(document.documentElement, {
      scrollY: -scrollTop,
      windowWidth: document.documentElement.clientWidth,
      windowHeight: window.innerHeight,
      width: document.documentElement.clientWidth,
      height: window.innerHeight,
      useCORS: true,
      allowTaint: true,
      logging: false,
      removeContainer: true,
      backgroundColor: null,
      scale: 2,
      foreignObjectRendering: true,
      imageSmoothingEnabled: true,
      imageSmoothingQuality: "high",
      onclone: function (clonedDoc) {
        // Remove plugin elements
        $(clonedDoc)
          .find(
            "#capture-button, #download-popup, #processing-overlay, .capture-button-inline"
          )
          .remove();

        // Copy original styles
        const styles = document.getElementsByTagName("style");
        const links = document.getElementsByTagName("link");

        Array.from(styles).forEach((style) => {
          clonedDoc.head.appendChild(style.cloneNode(true));
        });

        Array.from(links).forEach((link) => {
          if (link.rel === "stylesheet") {
            clonedDoc.head.appendChild(link.cloneNode(true));
          }
        });

        // Preserve computed styles
        Array.from(clonedDoc.getElementsByTagName("*")).forEach((element) => {
          const computedStyle = window.getComputedStyle(element);
          element.style.cssText = computedStyle.cssText;
        });
      },
    });

    return canvas;
  }

  async function startCapture(clickedElement) {
    if (capturing) return;
    capturing = true;

    const $clickedButton = $(clickedElement);
    $clickedButton.addClass("capturing");
    $("#capture-button, .capture-button-inline").prop("disabled", true);

    try {
      const originalScrollPos = window.pageYOffset;
      const originalBackground = $("body").css("backgroundColor");

      const totalHeight = Math.max(
        document.body.scrollHeight,
        document.documentElement.scrollHeight,
        document.body.offsetHeight,
        document.documentElement.offsetHeight
      );

      const finalCanvas = document.createElement("canvas");
      const ctx = finalCanvas.getContext("2d");

      finalCanvas.width = document.documentElement.clientWidth * 2;
      finalCanvas.height = totalHeight * 2;

      // Clear canvas while preserving transparency
      ctx.clearRect(0, 0, finalCanvas.width, finalCanvas.height);

      // Scroll to top first
      await smoothScroll(0);

      const viewportHeight = window.innerHeight;
      let currentScroll = 0;

      while (currentScroll < totalHeight) {
        const sectionCanvas = await captureSection(currentScroll);

        // Draw section with high quality settings
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(
          sectionCanvas,
          0,
          currentScroll * 2,
          sectionCanvas.width,
          sectionCanvas.height
        );

        currentScroll += viewportHeight;
        if (currentScroll < totalHeight) {
          await smoothScroll(currentScroll);
        }
      }

      // Restore scroll position
      window.scrollTo(0, originalScrollPos);
      capturedCanvas = finalCanvas;
      showDownloadPopup();
    } catch (error) {
      console.error("Capture failed:", error);
      alert("Failed to capture page. Please try again.");
    } finally {
      $clickedButton.removeClass("capturing");
      $("#capture-button, .capture-button-inline").prop("disabled", false);
      capturing = false;
    }
  }

  async function convertToPdf() {
    if (!capturedCanvas) {
      alert("No capture available. Please capture the page first.");
      return;
    }

    showProcessingOverlay();

    try {
      const { jsPDF } = window.jspdf;

      // A4 dimensions in mm
      const a4Width = 210;
      const a4Height = 297;

      // Set margins
      const margins = {
        top: 10,
        bottom: 10,
        left: 10,
        right: 10,
      };

      // Calculate content area
      const contentWidth = a4Width - margins.left - margins.right;
      const contentHeight = a4Height - margins.top - margins.bottom;

      // Calculate scale for content
      const originalWidth = capturedCanvas.width / 2;
      const originalHeight = capturedCanvas.height / 2;
      const scale = contentWidth / originalWidth;
      const scaledHeight = originalHeight * scale;

      // Create PDF with white background
      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
        compress: true,
      });

      // Calculate pages needed
      const totalPages = Math.ceil(scaledHeight / contentHeight);

      // Process each page
      for (let page = 0; page < totalPages; page++) {
        if (page > 0) {
          pdf.addPage();
        }

        // Create temporary canvas for content section
        const tempCanvas = document.createElement("canvas");
        const tempCtx = tempCanvas.getContext("2d");

        const sourceY = ((page * contentHeight) / scale) * 2;
        const sourceHeight = Math.min(
          (contentHeight / scale) * 2,
          capturedCanvas.height - sourceY
        );

        tempCanvas.width = capturedCanvas.width;
        tempCanvas.height = sourceHeight;

        // Use high quality settings
        tempCtx.imageSmoothingEnabled = true;
        tempCtx.imageSmoothingQuality = "high";

        tempCtx.drawImage(
          capturedCanvas,
          0,
          sourceY,
          capturedCanvas.width,
          sourceHeight,
          0,
          0,
          tempCanvas.width,
          sourceHeight
        );

        // Add content to PDF with high quality settings
        pdf.addImage(
          tempCanvas.toDataURL("image/png", 1.0),
          "PNG",
          margins.left,
          margins.top,
          contentWidth,
          (sourceHeight / 2) * scale,
          "",
          "FAST"
        );

        tempCanvas.remove();
      }

      pdf.save(document.title + "-capture.pdf");
      hideProcessingOverlay();
    } catch (error) {
      console.error("PDF conversion failed:", error);
      alert("Failed to convert to PDF. Please try again.");
      hideProcessingOverlay();
    }
  }

  function showProcessingOverlay() {
    $(`
        <div id="processing-overlay">
          <div class="processing-content">
            <div class="spinner"></div>
            <p>Converting to PDF...</p>
          </div>
        </div>
      `).appendTo("body");
  }

  function hideProcessingOverlay() {
    $("#processing-overlay").fadeOut(function () {
      $(this).remove();
    });
  }

  function showDownloadPopup() {
    $("#download-popup").remove();

    const popup = $(`
        <div id="download-popup">
          <div class="download-content">
            <h3>Capture Complete!</h3>
            <div class="download-buttons">
              <button id="download-png" class="download-btn">Download as PNG</button>
              <button id="download-pdf" class="download-btn">Download as PDF</button>
            </div>
          </div>
        </div>
      `).appendTo("body");

    $("#download-png").click(function () {
      capturedCanvas.toBlob(
        function (blob) {
          const url = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.download = (document.title || "page-capture") + ".png";
          link.href = url;
          link.click();
          URL.revokeObjectURL(url);
          popup.fadeOut(function () {
            $(this).remove();
          });
        },
        "image/png",
        1.0
      );
    });

    $("#download-pdf").click(function () {
      convertToPdf();
      popup.fadeOut(function () {
        $(this).remove();
      });
    });

    popup.click(function (e) {
      if ($(e.target).is("#download-popup")) {
        popup.fadeOut(function () {
          $(this).remove();
        });
      }
    });
  }

  // Initialize capture buttons
  $("#capture-button, .capture-button-inline").click(function () {
    startCapture(this);
  });
});
